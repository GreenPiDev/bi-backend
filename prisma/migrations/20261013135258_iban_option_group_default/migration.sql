-- AlterTable
ALTER TABLE "crm_iban_option_groups" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "crm_iban_option_groups_tenantId_isDefault_idx" ON "crm_iban_option_groups"("tenantId", "isDefault");
