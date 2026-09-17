-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('TRY', 'USD', 'EUR', 'GBP', 'CHF', 'JPY');

-- AlterTable
ALTER TABLE "crm_opportunities" ADD COLUMN     "estimatedValueCurrency" "CurrencyCode" NOT NULL DEFAULT 'TRY';
