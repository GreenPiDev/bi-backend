/*
  Warnings:

  - You are about to drop the column `ibanAccountHolderName` on the `crm_quotes` table. All the data in the column will be lost.
  - You are about to drop the column `ibanAccountNumber` on the `crm_quotes` table. All the data in the column will be lost.
  - You are about to drop the column `ibanBankName` on the `crm_quotes` table. All the data in the column will be lost.
  - You are about to drop the column `ibanNumber` on the `crm_quotes` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "crm_iban_options" ADD COLUMN     "groupId" TEXT;

-- AlterTable: once yeni JSONB kolonunu ekle ve mevcut 4 flat kolondan veriyi
-- tasi (currency bilgisi eski snapshot'ta hic tutulmuyordu, 'TRY' varsayilir),
-- SONRA eski kolonlari sil - veri kaybini onlemek icin.
ALTER TABLE "crm_quotes" ADD COLUMN     "ibanAccounts" JSONB;

UPDATE "crm_quotes"
SET "ibanAccounts" = jsonb_build_array(
  jsonb_build_object(
    'bankName', "ibanBankName",
    'accountHolderName', "ibanAccountHolderName",
    'accountNumber', "ibanAccountNumber",
    'iban', "ibanNumber",
    'currency', 'TRY'
  )
)
WHERE "ibanBankName" IS NOT NULL AND "ibanNumber" IS NOT NULL;

ALTER TABLE "crm_quotes" DROP COLUMN "ibanAccountHolderName",
DROP COLUMN "ibanAccountNumber",
DROP COLUMN "ibanBankName",
DROP COLUMN "ibanNumber";

-- CreateTable
CREATE TABLE "crm_iban_option_groups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_iban_option_groups_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "crm_iban_option_groups" ADD CONSTRAINT "crm_iban_option_groups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_iban_options" ADD CONSTRAINT "crm_iban_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "crm_iban_option_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
