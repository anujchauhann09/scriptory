-- Keep the existing HTML body as the rendering/search fallback while adding a
-- nullable canonical source contract for new and edited articles.
ALTER TABLE "Article"
ADD COLUMN "contentSource" JSONB,
ADD COLUMN "contentFormat" TEXT NOT NULL DEFAULT 'legacy-html',
ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 0;
