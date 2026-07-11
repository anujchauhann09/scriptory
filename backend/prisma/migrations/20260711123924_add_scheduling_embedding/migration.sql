-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "embedding" JSONB,
ADD COLUMN     "publishAt" TIMESTAMP(3);
