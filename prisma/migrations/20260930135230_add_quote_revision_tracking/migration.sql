-- AlterTable
ALTER TABLE "crm_quotes" ADD COLUMN     "lastRevisedAt" TIMESTAMP(3),
ADD COLUMN     "revisionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "revisionNote" TEXT,
ADD COLUMN     "revisionSnapshot" JSONB;
