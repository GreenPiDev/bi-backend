-- AlterTable
ALTER TABLE "crm_messages" ADD COLUMN     "isMeetingReport" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "crm_messages_tenantId_isMeetingReport_idx" ON "crm_messages"("tenantId", "isMeetingReport");
