-- AlterTable
ALTER TABLE "crm_quotes" ADD COLUMN     "contactId" TEXT;

-- CreateTable
CREATE TABLE "crm_post_sale_cases" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "reminderAt" TIMESTAMP(3) NOT NULL,
    "reminderSentAt" TIMESTAMP(3),
    "feedbackReceivedAt" TIMESTAMP(3),
    "feedbackNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_post_sale_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_feedback_surveys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "postSaleCaseId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_feedback_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_post_sale_cases_quoteId_key" ON "crm_post_sale_cases"("quoteId");

-- CreateIndex
CREATE INDEX "crm_post_sale_cases_tenantId_reminderAt_idx" ON "crm_post_sale_cases"("tenantId", "reminderAt");

-- CreateIndex
CREATE INDEX "crm_post_sale_cases_tenantId_accountId_idx" ON "crm_post_sale_cases"("tenantId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_feedback_surveys_postSaleCaseId_key" ON "crm_feedback_surveys"("postSaleCaseId");

-- CreateIndex
CREATE INDEX "crm_quotes_tenantId_contactId_idx" ON "crm_quotes"("tenantId", "contactId");

-- AddForeignKey
ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_post_sale_cases" ADD CONSTRAINT "crm_post_sale_cases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_post_sale_cases" ADD CONSTRAINT "crm_post_sale_cases_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_post_sale_cases" ADD CONSTRAINT "crm_post_sale_cases_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_post_sale_cases" ADD CONSTRAINT "crm_post_sale_cases_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_feedback_surveys" ADD CONSTRAINT "crm_feedback_surveys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_feedback_surveys" ADD CONSTRAINT "crm_feedback_surveys_postSaleCaseId_fkey" FOREIGN KEY ("postSaleCaseId") REFERENCES "crm_post_sale_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_feedback_surveys" ADD CONSTRAINT "crm_feedback_surveys_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SeedData: Satis Sonrasi Destek sayfasi crm modulune bagli - bkz. docs/VARSAYIMLAR.md V28,
-- ayni desen daha once quotes/products/price-lists icin kullanildi (migration
-- 20260906183736).
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('post-sale-cases', 'crm', CURRENT_TIMESTAMP);
