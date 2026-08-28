const { Prisma } = require("@prisma/client");
const prisma = require("../config/db");
const logger = require("./logger");

/**
 * Mutual exclusion and replay protection for scheduled tasks.
 *
 * An external scheduler is an at-least-once trigger. Cloud Scheduler retries on
 * a non-2xx response and on an attempt deadline it did not hear back from —
 * including the case where the work completed but the reply was lost. Nothing
 * about "it ran once on the schedule" is guaranteed by the scheduler itself.
 *
 * For a task whose effect is a conditional UPDATE that is fine: running twice
 * lands in the same state. For one that sends email it is not, so the guarantee
 * has to live here, in the database both instances already share.
 *
 * Two protections, decided in one atomic statement so concurrent callers cannot
 * both win:
 *
 *   - **Lease** (`lockedUntil`) — only one run at a time. Expressed as a lease
 *     rather than a lock so a container killed mid-task cannot wedge the job
 *     permanently; the lease simply expires.
 *
 *   - **Run key** (`lastRunKey`) — only one run per logical occurrence. A retry
 *     carrying the key of a run that already completed is skipped. Callers that
 *     genuinely mean "do it again now" pass no key.
 */

/**
 * Time base for every raw-SQL comparison in this file.
 *
 * Prisma maps `DateTime` to `timestamp without time zone` and writes UTC into
 * it. Postgres's `now()` is a `timestamptz`, so writing or comparing it against
 * that column silently converts through the *session* time zone — UTC on Cloud
 * SQL, but Asia/Kolkata on a developer's machine, and the two disagree by hours.
 *
 * As long as a column is only ever written and read by `now()` the skew cancels
 * out, which is why this was invisible. It stops cancelling the moment Prisma
 * writes the same column, and then a lease looks expired when it is not.
 *
 * `now() AT TIME ZONE 'UTC'` yields a naive timestamp already in UTC, which is
 * exactly the convention Prisma uses — so SQL-written and Prisma-written values
 * are interchangeable regardless of where the code runs.
 */
const NOW_UTC = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

/** A lease outlives the work it guards, then expires on its own. */
const DEFAULT_TTL_MS = 10 * 60 * 1000;

/**
 * Claims the task, atomically.
 *
 * The `WHERE` on the upsert is what makes this safe: Postgres evaluates the
 * conflict target and the predicate under a row lock, so of two simultaneous
 * callers exactly one gets a row back and the other gets none. A read followed
 * by a write would let both pass.
 */
const acquire = async (task, { ttlMs = DEFAULT_TTL_MS, runKey = null } = {}) => {
  const ttlSeconds = Math.ceil(ttlMs / 1000);

  const rows = await prisma.$queryRaw(Prisma.sql`
    INSERT INTO "TaskLease" ("task", "lockedUntil", "updatedAt")
    VALUES (
      ${task},
      ${NOW_UTC} + make_interval(secs => ${ttlSeconds}::double precision),
      ${NOW_UTC}
    )
    ON CONFLICT ("task") DO UPDATE SET
      "lockedUntil" = ${NOW_UTC} + make_interval(secs => ${ttlSeconds}::double precision),
      "updatedAt" = ${NOW_UTC}
    WHERE
      -- free, or the previous holder's lease has expired
      ("TaskLease"."lockedUntil" IS NULL OR "TaskLease"."lockedUntil" < ${NOW_UTC})
      -- and this exact occurrence has not already completed
      AND (${runKey}::text IS NULL OR "TaskLease"."lastRunKey" IS DISTINCT FROM ${runKey})
    RETURNING "task"
  `);

  return rows.length > 0;
};

/**
 * Releases the lease.
 *
 * `lastRunKey` is recorded only on success. A failed run leaves the key unset so
 * the scheduler's retry is allowed to do the work — which is the whole point of
 * retrying — while a successful one is never repeated.
 */
const release = async (task, { runKey = null, succeeded }) => {
  if (succeeded && runKey) {
    await prisma.taskLease.update({
      where: { task },
      data: { lockedUntil: null, lastRunKey: runKey, lastRunAt: new Date() },
    });
    return;
  }
  await prisma.taskLease.update({
    where: { task },
    data: { lockedUntil: null, ...(succeeded ? { lastRunAt: new Date() } : {}) },
  });
};

/**
 * Runs `fn` at most once for the given task and occurrence.
 *
 * Returns the task's own result plus `{ skipped }` when another runner held the
 * lease or the occurrence was already done. Skipping is a success, not an
 * error: the caller replies 200 so the scheduler stops retrying, because the
 * work it asked for has in fact happened.
 *
 * Fails CLOSED. If the lease table is unreachable the task does not run, which
 * for an email broadcast is the right way round — a missed digest is recoverable,
 * a duplicate one sent to every subscriber is not.
 */
const withLease = async (task, options, fn) => {
  const { ttlMs = DEFAULT_TTL_MS, runKey = null } = options || {};

  let acquired;
  try {
    acquired = await acquire(task, { ttlMs, runKey });
  } catch (err) {
    logger.error("Could not acquire task lease, refusing to run", {
      task,
      runKey,
      message: err.message,
    });
    const error = new Error("Task coordination is unavailable, refusing to run");
    error.statusCode = 503;
    throw error;
  }

  if (!acquired) {
    logger.info("Scheduled task skipped: already running or already done", { task, runKey });
    return { skipped: true, reason: "already-running-or-complete", task, runKey };
  }

  try {
    const result = await fn();
    await release(task, { runKey, succeeded: true }).catch((err) =>
      logger.error("Task lease release failed after success", { task, message: err.message })
    );
    return { skipped: false, ...result };
  } catch (err) {
    // Release without recording the key so a retry is still permitted.
    await release(task, { runKey, succeeded: false }).catch((releaseErr) =>
      logger.error("Task lease release failed after error", { task, message: releaseErr.message })
    );
    throw err;
  }
};

/**
 * ISO-week key, e.g. "2026-W35".
 *
 * The digest is weekly, so the week is its natural unit of "the same run". A
 * retry twenty minutes later carries the same key and is skipped; next week's
 * firing carries a new one and proceeds.
 */
const isoWeekKey = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO weeks run Monday–Sunday and belong to the year containing their Thursday.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

/** Calendar-day key, for tasks that should run once a day. */
const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

module.exports = { withLease, isoWeekKey, dayKey, DEFAULT_TTL_MS };
