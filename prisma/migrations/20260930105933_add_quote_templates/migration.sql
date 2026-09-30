-- AlterTable
ALTER TABLE "crm_quotes" ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "crm_quote_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "logoKey" TEXT,
    "coverImageKey" TEXT,
    "closingImageKey" TEXT,
    "companyDisplayName" TEXT NOT NULL,
    "companyTagline" TEXT,
    "companyPhone" TEXT,
    "companyEmail" TEXT,
    "companyAddressLines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "senderName" TEXT,
    "senderTitle" TEXT,
    "senderPhone" TEXT,
    "senderEmail" TEXT,
    "salesConditionsText" TEXT,
    "deliveryConditionsText" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_quote_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_quote_template_bank_accounts" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "iban" TEXT NOT NULL,
    "currencyLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "crm_quote_template_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_quote_templates_tenantId_idx" ON "crm_quote_templates"("tenantId");

-- CreateIndex
CREATE INDEX "crm_quote_templates_tenantId_isDefault_idx" ON "crm_quote_templates"("tenantId", "isDefault");

-- CreateIndex
CREATE INDEX "crm_quotes_tenantId_templateId_idx" ON "crm_quotes"("tenantId", "templateId");

-- AddForeignKey
ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "crm_quote_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quote_templates" ADD CONSTRAINT "crm_quote_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quote_template_bank_accounts" ADD CONSTRAINT "crm_quote_template_bank_accounts_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "crm_quote_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
