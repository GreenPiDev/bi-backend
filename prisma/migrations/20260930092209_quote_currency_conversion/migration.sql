-- AlterTable
ALTER TABLE "crm_quotes" ADD COLUMN     "exchangeRates" JSONB,
ADD COLUMN     "quoteCurrency" TEXT NOT NULL DEFAULT 'TRY';
