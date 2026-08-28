-- CreateTable
CREATE TABLE "TaskLease" (
    "task" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3),
    "lastRunKey" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskLease_pkey" PRIMARY KEY ("task")
);
