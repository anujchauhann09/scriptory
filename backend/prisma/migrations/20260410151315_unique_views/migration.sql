-- CreateTable
CREATE TABLE "ViewRecord" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "viewId" INTEGER NOT NULL,
    "userId" INTEGER,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ViewRecord_articleId_idx" ON "ViewRecord"("articleId");

-- CreateIndex
CREATE INDEX "ViewRecord_userId_idx" ON "ViewRecord"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ViewRecord_articleId_fingerprint_key" ON "ViewRecord"("articleId", "fingerprint");

-- AddForeignKey
ALTER TABLE "ViewRecord" ADD CONSTRAINT "ViewRecord_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "View"("id") ON DELETE CASCADE ON UPDATE CASCADE;
