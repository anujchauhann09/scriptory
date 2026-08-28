const { Prisma } = require("@prisma/client");
const prisma = require("../config/db");
const logger = require("./logger");

/**
 * Globally-consistent brute-force throttle for credential endpoints.
 *
 * The in-process rate limiter in middleware/rateLimit is per container, so an
 * autoscaled deployment multiplies an attacker's guess budget by the instance
 * count. For every other endpoint that is an acceptable trade; for password
 * guessing it is not, because the attacker only has to win once.
 *
 * This closes that gap using the Postgres instance the app already runs on:
 * a single-row upsert per failed attempt, no new service, no Redis. The cost is
 * one indexed write on failure and one indexed read per attempt — negligible at
 * credential-endpoint volumes, and nothing at all on the success path.
 *
 * Two keys are tracked per attempt:
 *   - the account, so guessing one password from a botnet of rotating IPs is
 *     still capped;
 *   - the client IP, so spraying one password across many accounts is capped
 *     too.
 */

const WINDOW_SECONDS = Number(process.env.LOGIN_THROTTLE_WINDOW_SECONDS) || 15 * 60;

/**
 * Per-account ceiling. Generous enough that someone genuinely fumbling their
 * password is never locked out of their own account by accident, tight enough
 * that an online guessing attack is hopeless: 8 guesses per 15 minutes is under
 * 800 a day against a bcrypt-hashed password.
 */
const MAX_ACCOUNT_FAILURES = Number(process.env.LOGIN_THROTTLE_MAX_ACCOUNT) || 8;

/**
 * Per-IP ceiling, deliberately higher: a shared office or campus NAT can have
 * many legitimate users behind one address, and locking them out together would
 * be a self-inflicted denial of service.
 */
const MAX_IP_FAILURES = Number(process.env.LOGIN_THROTTLE_MAX_IP) || 30;

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

const accountKey = (email) => `email:${String(email || "").trim().toLowerCase()}`;
const ipKey = (ip) => `ip:${ip}`;

/**
 * Records a failure and returns the resulting count, atomically.
 *
 * The whole fixed-window decision happens inside one statement so concurrent
 * attempts cannot interleave into a lost update — which, with a naive
 * read-then-write, is exactly the race a parallel attacker would exploit.
 */
const recordFailure = async (key) => {
  const rows = await prisma.$queryRaw(Prisma.sql`
    INSERT INTO "LoginThrottle" ("key", "failures", "windowStart", "updatedAt")
    VALUES (${key}, 1, ${NOW_UTC}, ${NOW_UTC})
    ON CONFLICT ("key") DO UPDATE SET
      "failures" = CASE
        WHEN "LoginThrottle"."windowStart" < ${NOW_UTC} - make_interval(secs => ${WINDOW_SECONDS}::double precision)
        THEN 1 ELSE "LoginThrottle"."failures" + 1 END,
      "windowStart" = CASE
        WHEN "LoginThrottle"."windowStart" < ${NOW_UTC} - make_interval(secs => ${WINDOW_SECONDS}::double precision)
        THEN ${NOW_UTC} ELSE "LoginThrottle"."windowStart" END,
      "updatedAt" = ${NOW_UTC}
    RETURNING "failures", "windowStart"
  `);
  return rows[0] || { failures: 1, windowStart: new Date() };
};

const retryAfterSeconds = (windowStart) =>
  Math.max(1, Math.ceil((windowStart.getTime() + WINDOW_SECONDS * 1000 - Date.now()) / 1000));

/**
 * Reserves an attempt, atomically, and reports whether it may proceed.
 *
 * The counter is incremented BEFORE the password is verified, not after. A
 * read-then-verify-then-write sequence is a check-then-act race with a very
 * wide window — bcrypt sits in the middle of it for a quarter of a second — so
 * an attacker firing 200 requests in parallel has all 200 read a count below
 * the limit and pass the gate. The account would lock after 200 guesses instead
 * of 8. Counting first closes that: the increment and the decision happen in
 * one statement, so concurrency cannot manufacture extra budget.
 *
 * The cost is that a *successful* login also consumes a slot, which is why
 * `releaseSuccess` gives it back below.
 *
 * Fails OPEN on a database error: a throttle table that is briefly unreachable
 * must not take the login endpoint down with it. The in-process limiter is
 * still in front, so the failure mode is "degraded to per-instance limits",
 * not "unprotected".
 */
const reserve = async ({ email, ip }) => {
  try {
    const [account, client] = await Promise.all([
      recordFailure(accountKey(email)),
      recordFailure(ipKey(ip)),
    ]);

    if (account.failures > MAX_ACCOUNT_FAILURES) {
      return { allowed: false, scope: "account", retryAfter: retryAfterSeconds(account.windowStart) };
    }
    if (client.failures > MAX_IP_FAILURES) {
      return { allowed: false, scope: "ip", retryAfter: retryAfterSeconds(client.windowStart) };
    }
    return { allowed: true };
  } catch (err) {
    logger.error("Login throttle reserve failed, allowing attempt", { message: err.message });
    return { allowed: true };
  }
};

/** Records a credential failure on a path that did not go through `reserve`. */
const registerFailure = async ({ email, ip }) => {
  try {
    await Promise.all([recordFailure(accountKey(email)), recordFailure(ipKey(ip))]);
  } catch (err) {
    logger.error("Login throttle write failed", { message: err.message });
  }
};

/**
 * Called after a successful authentication, to undo that attempt's reservation.
 *
 * The account counter is cleared outright — a working login proves the owner is
 * present. The IP counter is only decremented by the one slot this attempt
 * took, never cleared: a shared office address must not be locked out by its
 * colleagues signing in normally, but an attacker who happens to hold one valid
 * account must not be able to reset their whole password-spraying budget at
 * will either.
 */
const releaseSuccess = async ({ email, ip }) => {
  try {
    await Promise.all([
      prisma.loginThrottle.deleteMany({ where: { key: accountKey(email) } }),
      prisma.loginThrottle
        .updateMany({ where: { key: ipKey(ip), failures: { gt: 0 } }, data: { failures: { decrement: 1 } } })
        .catch(() => {}),
    ]);
  } catch (err) {
    logger.error("Login throttle release failed", { message: err.message });
  }
};

/** Clears an account's counter without touching the client address counter. */
const clearAccount = async (email) => {
  try {
    await prisma.loginThrottle.deleteMany({ where: { key: accountKey(email) } });
  } catch (err) {
    logger.error("Login throttle clear failed", { message: err.message });
  }
};

/** Drops counters whose window has long expired. Run from the maintenance task. */
const prune = async () => {
  const cutoff = new Date(Date.now() - WINDOW_SECONDS * 1000 * 4);
  const { count } = await prisma.loginThrottle.deleteMany({ where: { updatedAt: { lt: cutoff } } });
  return count;
};

module.exports = {
  reserve,
  registerFailure,
  releaseSuccess,
  clearAccount,
  prune,
  windowSeconds: WINDOW_SECONDS,
  maxAccountFailures: MAX_ACCOUNT_FAILURES,
  maxIpFailures: MAX_IP_FAILURES,
};
