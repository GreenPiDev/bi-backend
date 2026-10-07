-- CreateTable
CREATE TABLE "crm_quote_status_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_quote_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_quote_status_history_tenantId_quoteId_createdAt_idx" ON "crm_quote_status_history"("tenantId", "quoteId", "createdAt");

-- AddForeignKey
ALTER TABLE "crm_quote_status_history" ADD CONSTRAINT "crm_quote_status_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quote_status_history" ADD CONSTRAINT "crm_quote_status_history_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
