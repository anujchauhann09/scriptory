-- Archiving: retire an article from discovery without taking its URL away.
--
-- Nullable and with no default, so every existing row is "not archived" and the
-- migration is a metadata-only change — no table rewrite, no backfill.
-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- Listings, feeds and related-post queries all filter on this.
-- CreateIndex
CREATE INDEX "Article_archivedAt_idx" ON "Article"("archivedAt");
