-- CreateEnum
CREATE TYPE "QuoteItemsEntryMode" AS ENUM ('ITEMIZED', 'MANUAL_TOTAL');

-- AlterTable
ALTER TABLE "crm_quotes" ADD COLUMN     "itemsEntryMode" "QuoteItemsEntryMode" NOT NULL DEFAULT 'ITEMIZED',
ADD COLUMN     "manualCurrency" TEXT,
ADD COLUMN     "manualSubtotal" DECIMAL(14,2),
ADD COLUMN     "manualVatAmount" DECIMAL(14,2);
