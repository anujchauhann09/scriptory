/**
 * Scheduled-task safety under horizontal scaling.
 *
 * These exist because the failure they guard against is invisible in
 * development: with one instance and one trigger everything looks correct, and
 * the duplicate only appears in production when a retry fires or two instances
 * overlap — by which point every subscriber has two emails.
 *
 * Run with: npm test
 */
const assert = require("node:assert/strict");
const test = require("node:test");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
process.env.API_URL = process.env.API_URL || "http://localhost:5000";

const prisma = require("../src/config/db");
const { withLease, isoWeekKey, dayKey } = require("../src/utils/taskLease");
const database = require("../src/config/database");

const TASK = "test-lease-task";

test.beforeEach(async () => {
  await prisma.taskLease.deleteMany({ where: { task: { startsWith: "test-" } } });
});

test.after(async () => {
  await prisma.taskLease.deleteMany({ where: { task: { startsWith: "test-" } } });
  await prisma.$disconnect();
});

// --- mutual exclusion ------------------------------------------------------

test("two concurrent runs of the same task cannot both proceed", async () => {
  let running = 0;
  let maxConcurrent = 0;

  const work = async () => {
    running += 1;
    maxConcurrent = Math.max(maxConcurrent, running);
    await new Promise((r) => setTimeout(r, 120));
    running -= 1;
    return { sent: 1 };
  };

  // Simulates the cron firing while an admin presses the button — or, on Cloud
  // Run, two instances handed the same trigger.
  const [a, b] = await Promise.all([
    withLease(TASK, {}, work),
    withLease(TASK, {}, work),
  ]);

  const ran = [a, b].filter((r) => !r.skipped);
  const skipped = [a, b].filter((r) => r.skipped);

  assert.equal(ran.length, 1, "both runs executed — the lease did not hold");
  assert.equal(skipped.length, 1);
  assert.equal(maxConcurrent, 1, "the task body overlapped itself");
  assert.equal(skipped[0].reason, "already-running-or-complete");
});

test("a run key makes a retry of the same occurrence a no-op", async () => {
  let calls = 0;
  const work = async () => {
    calls += 1;
    return { sent: 5 };
  };

  const key = "2026-W35";
  const first = await withLease(TASK, { runKey: key }, work);
  assert.equal(first.skipped, false);
  assert.equal(first.sent, 5);

  // The scheduler retrying after a lost response: same occurrence, must not
  // send a second time.
  const retry = await withLease(TASK, { runKey: key }, work);
  assert.equal(retry.skipped, true, "a retry re-ran a completed occurrence");
  assert.equal(calls, 1, "the work ran twice for one occurrence");

  // Next week's firing is a different occurrence and must proceed.
  const nextWeek = await withLease(TASK, { runKey: "2026-W36" }, work);
  assert.equal(nextWeek.skipped, false);
  assert.equal(calls, 2);
});

test("a failed run is retryable — the key is only recorded on success", async () => {
  let attempt = 0;
  const flaky = async () => {
    attempt += 1;
    if (attempt === 1) throw new Error("SMTP unavailable");
    return { sent: 3 };
  };

  const key = "2026-W40";

  await assert.rejects(() => withLease(TASK, { runKey: key }, flaky), /SMTP unavailable/);

  // The lease must be released, and the occurrence must NOT be marked done —
  // otherwise a transient failure would silently skip that week entirely.
  const afterFailure = await prisma.taskLease.findUnique({ where: { task: TASK } });
  assert.equal(afterFailure.lockedUntil, null, "the lease was not released after a failure");
  assert.notEqual(afterFailure.lastRunKey, key, "a failed run was recorded as complete");

  const retry = await withLease(TASK, { runKey: key }, flaky);
  assert.equal(retry.skipped, false, "the retry after a failure was refused");
  assert.equal(retry.sent, 3);
});

test("an expired lease is reclaimed, so a crashed runner cannot wedge the task", async () => {
  // Simulates a container killed mid-task: the row still says "locked", but the
  // holder is gone and the lease has aged out.
  await prisma.taskLease.create({
    data: { task: TASK, lockedUntil: new Date(Date.now() - 60_000) },
  });

  const result = await withLease(TASK, {}, async () => ({ recovered: true }));
  assert.equal(result.skipped, false, "an expired lease still blocked the task");
  assert.equal(result.recovered, true);
});

test("a live lease held by someone else is respected", async () => {
  await prisma.taskLease.create({
    data: { task: TASK, lockedUntil: new Date(Date.now() + 60_000) },
  });

  let ran = false;
  const result = await withLease(TASK, {}, async () => {
    ran = true;
    return {};
  });

  assert.equal(result.skipped, true, "a live lease was ignored");
  assert.equal(ran, false, "the task body ran while another holder had the lease");
});

// --- run keys --------------------------------------------------------------

test("run keys identify the right occurrence", () => {
  // Same week -> same key, so a retry is recognised as the same digest.
  const monday = new Date("2026-08-24T09:00:00Z");
  const thursday = new Date("2026-08-27T23:00:00Z");
  assert.equal(isoWeekKey(monday), isoWeekKey(thursday));

  // Different week -> different key, so next week's digest is not suppressed.
  const nextMonday = new Date("2026-08-31T09:00:00Z");
  assert.notEqual(isoWeekKey(monday), isoWeekKey(nextMonday));

  assert.match(isoWeekKey(monday), /^\d{4}-W\d{2}$/);

  assert.equal(dayKey(new Date("2026-08-27T23:59:00Z")), "2026-08-27");
  assert.notEqual(dayKey(new Date("2026-08-27T00:00:00Z")), dayKey(new Date("2026-08-28T00:00:00Z")));
});

// --- idempotent tasks are deliberately unleased ----------------------------

test("publishing due drafts is idempotent, so concurrent runs converge", async () => {
  const tasks = require("../src/modules/internal/internal.tasks");

  const author = await prisma.user.findFirst({ select: { id: true } });
  if (!author) return; // nothing to publish against on an empty database

  const slug = `lease-idempotency-${Date.now()}`;
  const article = await prisma.article.create({
    data: {
      title: "Lease Idempotency Check",
      slug,
      content: "<p>Scheduled into the past so the next run publishes it.</p>",
      authorId: author.id,
      published: false,
      publishAt: new Date(Date.now() - 60_000),
    },
    select: { uuid: true },
  });

  try {
    // Two instances handed the same tick. The second must find nothing left.
    const [first, second] = await Promise.all([
      tasks.publishScheduledDrafts(),
      tasks.publishScheduledDrafts(),
    ]);

    const total = (first.published || 0) + (second.published || 0);
    assert.equal(total, 1, `the article was published ${total} times, expected exactly once`);

    const row = await prisma.article.findUnique({
      where: { uuid: article.uuid },
      select: { published: true },
    });
    assert.equal(row.published, true);
  } finally {
    await prisma.article.delete({ where: { uuid: article.uuid } }).catch(() => {});
  }
});

// --- connection budget -----------------------------------------------------

test("the connection budget fits the configured database tier", () => {
  const budget = database.describeBudget();

  assert.ok(
    budget.peakDuringDeploy > budget.steadyState,
    "the peak must account for two revisions overlapping during a deploy"
  );

  assert.ok(
    budget.fits,
    `pool budget does not fit the tier: ${JSON.stringify(budget)}`
  );

  // The headroom is what migrations, psql and Cloud SQL's own tooling use.
  assert.ok(budget.headroom >= 0, "no connections left for migrations or admin access");
});

test("SQL-written and Prisma-written timestamps use the same convention", async () => {
  /**
   * Regression guard for a bug that only shows up off UTC.
   *
   * Prisma writes `DateTime` as UTC into a `timestamp without time zone`
   * column, while Postgres `now()` is a `timestamptz` that converts through the
   * *session* zone. Mixing the two makes a live lease look expired by the size
   * of the offset — invisible on a UTC machine, hours wrong on a developer's.
   *
   * This test writes the lease with Prisma and reads it with the module's own
   * SQL, so the two conventions must agree for it to pass. It fails on any
   * machine whose database session is not UTC if the SQL ever drops the
   * explicit `AT TIME ZONE 'UTC'`.
   */
  const zone = await prisma.$queryRawUnsafe("SHOW TimeZone");
  const held = new Date(Date.now() + 5 * 60_000);

  await prisma.taskLease.create({ data: { task: TASK, lockedUntil: held } });

  let ran = false;
  const result = await withLease(TASK, {}, async () => {
    ran = true;
    return {};
  });

  assert.equal(
    result.skipped,
    true,
    `a Prisma-written lease five minutes in the future was treated as expired ` +
      `(session TimeZone=${zone[0].TimeZone}) — the SQL and Prisma time conventions disagree`
  );
  assert.equal(ran, false);

  // And the reverse direction: what the SQL wrote must read back as UTC.
  await prisma.taskLease.deleteMany({ where: { task: TASK } });
  await withLease(TASK, { ttlMs: 5 * 60_000 }, async () => {
    const midRun = await prisma.taskLease.findUnique({
      where: { task: TASK },
      select: { lockedUntil: true },
    });
    const skewMinutes = Math.abs((midRun.lockedUntil - Date.now()) / 60_000 - 5);
    assert.ok(
      skewMinutes < 1,
      `SQL wrote lockedUntil ${skewMinutes.toFixed(1)} minutes away from the expected 5 ` +
        `(session TimeZone=${zone[0].TimeZone}) — the write is not in UTC`
    );
    return {};
  });
});

// --- first-deploy bootstrap ------------------------------------------------

test("bootstrap mode never emits a placeholder unsubscribe link", async () => {
  /**
   * The failure this guards against is silent: with a placeholder or a null
   * interpolated into a template string, the email still sends and still looks
   * fine — it just carries a link to nowhere, or to somebody else's domain. So
   * the assertion is that nothing is sent at all.
   */
  const config = require("../src/config/env");
  const newsletterService = require("../src/modules/newsletter/newsletter.service");

  const original = config.apiUrl;
  try {
    config.apiUrl = null; // what API_URL_PENDING produces

    const result = await newsletterService.sendDigest();

    assert.equal(result.skipped, true, "the digest sent without a usable API URL");
    assert.equal(result.sent, 0);
    assert.match(result.message, /unsubscribe/i);
    assert.ok(
      !JSON.stringify(result).includes("null/api"),
      "a null API URL was interpolated into a link"
    );
  } finally {
    config.apiUrl = original;
  }
});

test("bootstrap mode leaves the SPA's CSRF allowlist intact", () => {
  // Only the API's own origin drops out. The frontend origin comes from
  // FRONTEND_URL, which is still required, so the SPA is unaffected.
  const csrf = require("../src/middleware/csrf.middleware");
  const config = require("../src/config/env");

  assert.ok(
    csrf.allowedOrigins.includes(config.frontendUrl),
    "the frontend origin is missing from the CSRF allowlist"
  );
  assert.ok(csrf.allowedOrigins.every((o) => typeof o === "string" && o.startsWith("http")));
});
