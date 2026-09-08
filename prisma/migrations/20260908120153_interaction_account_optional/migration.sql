-- DropForeignKey
ALTER TABLE "crm_interactions" DROP CONSTRAINT "crm_interactions_accountId_fkey";

-- AlterTable
ALTER TABLE "crm_interactions" ALTER COLUMN "accountId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
