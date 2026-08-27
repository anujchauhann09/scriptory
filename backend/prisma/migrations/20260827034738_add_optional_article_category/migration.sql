-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "categoryId" INTEGER;

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_uuid_key" ON "Category"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Category_sortOrder_idx" ON "Category"("sortOrder");

-- CreateIndex
CREATE INDEX "Article_categoryId_idx" ON "Article"("categoryId");

-- CreateIndex
CREATE INDEX "Article_categoryId_published_createdAt_idx" ON "Article"("categoryId", "published", "createdAt");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Seed the curated taxonomy.
--
-- Categories are a fixed product decision, not user data, so they ship with the
-- migration rather than being created on demand from the editor. That is the
-- whole point of the closed vocabulary: Tag and Series both auto-create
-- whatever string is typed, which is fine for free-form topics but would let a
-- typo become a permanent top-level category here.
--
-- "sortOrder" encodes the intended learning progression, not alphabetical or
-- creation order:
--   Backend Engineering -> System Design -> DSA & CS -> Cloud -> DevOps -> AI/ML
-- DSA & CS is placed third because it is the natural next step in the sequence,
-- but in practice it is studied alongside backend fundamentals rather than
-- strictly after them.
--
-- ON CONFLICT DO NOTHING makes this idempotent and safe to re-run, and means a
-- later migration can add a category without disturbing the existing rows or
-- any article already filed under them.
-- ---------------------------------------------------------------------------
INSERT INTO "Category" ("uuid", "slug", "name", "description", "sortOrder", "createdAt") VALUES
  (gen_random_uuid(), 'backend-engineering', 'Backend Engineering', 'APIs, data modelling, persistence, caching, and the day-to-day craft of building services.', 1, now()),
  (gen_random_uuid(), 'system-design',       'System Design',       'Scaling, distributed systems, trade-offs, and designing for failure.', 2, now()),
  (gen_random_uuid(), 'dsa-cs',              'DSA & Computer Science', 'Data structures, algorithms, and the computer-science fundamentals underneath everything else.', 3, now()),
  (gen_random_uuid(), 'cloud',               'Cloud',               'Managed infrastructure, cloud primitives, cost, and running software you do not own the hardware for.', 4, now()),
  (gen_random_uuid(), 'devops',              'DevOps',              'CI/CD, containers, observability, and the path from a commit to production.', 5, now()),
  (gen_random_uuid(), 'ai-ml-engineering',   'AI / ML Engineering', 'Building with models: embeddings, retrieval, evaluation, and putting ML into real systems.', 6, now())
ON CONFLICT ("slug") DO NOTHING;
