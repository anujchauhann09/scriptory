-- CreateTable
CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "LoginThrottle_updatedAt_idx" ON "LoginThrottle"("updatedAt");

-- ---------------------------------------------------------------------------
-- Full-text search index.
--
-- The search endpoint evaluates
--   to_tsvector('english', title || ' ' || excerpt || ' ' || content)
-- in its WHERE clause. Without a matching expression index Postgres has to
-- build that tsvector for every row on every search — a sequential scan whose
-- cost grows with both article count and article length, on the one public
-- endpoint an attacker can most cheaply repeat.
--
-- The expression must match the query's exactly, character for character, or
-- the planner will not use the index.
--
-- Prisma cannot express an expression index in schema.prisma, so this lives in
-- raw SQL. `prisma migrate dev` may therefore propose dropping it as drift;
-- keep it, and re-add it if a generated migration removes it.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Article_fulltext_idx"
  ON "Article"
  USING GIN (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(content, '')
    )
  );

-- Supports the scheduler's "drafts whose publishAt has passed" scan, which runs
-- every minute in cron mode.
CREATE INDEX IF NOT EXISTS "Article_publishAt_idx" ON "Article" ("publishAt") WHERE "published" = false;
