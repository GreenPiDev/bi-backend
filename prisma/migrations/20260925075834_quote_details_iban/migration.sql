-- AlterTable
ALTER TABLE "crm_quotes" ADD COLUMN     "deliveryTerms" TEXT,
ADD COLUMN     "ibanAccountHolderName" TEXT,
ADD COLUMN     "ibanAccountNumber" TEXT,
ADD COLUMN     "ibanBankName" TEXT,
ADD COLUMN     "ibanNumber" TEXT,
ADD COLUMN     "quoteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "salesTerms" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "crm_iban_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "iban" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_iban_options_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "crm_iban_options" ADD CONSTRAINT "crm_iban_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
