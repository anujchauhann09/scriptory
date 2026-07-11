-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "seriesId" INTEGER,
ADD COLUMN     "seriesOrder" INTEGER;

-- CreateTable
CREATE TABLE "Series" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Series_uuid_key" ON "Series"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Series_slug_key" ON "Series"("slug");

-- CreateIndex
CREATE INDEX "Article_seriesId_idx" ON "Article"("seriesId");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
