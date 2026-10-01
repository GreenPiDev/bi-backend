-- AlterTable
ALTER TABLE "crm_interactions" ADD COLUMN     "parentInteractionId" TEXT;

-- CreateIndex
CREATE INDEX "crm_interactions_tenantId_parentInteractionId_idx" ON "crm_interactions"("tenantId", "parentInteractionId");

-- AddForeignKey
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_parentInteractionId_fkey" FOREIGN KEY ("parentInteractionId") REFERENCES "crm_interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
