-- AlterTable
ALTER TABLE "crm_iban_option_groups" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "crm_quotes" ADD COLUMN     "validityPeriod" TEXT;
