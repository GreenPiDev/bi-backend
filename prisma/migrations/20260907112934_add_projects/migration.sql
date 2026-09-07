-- CreateTable
CREATE TABLE "crm_projects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectNumber" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "quoteId" TEXT,
    "name" TEXT NOT NULL,
    "estimatedBudget" DECIMAL(14,2) NOT NULL,
    "actualCost" DECIMAL(14,2),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_projects_quoteId_key" ON "crm_projects"("quoteId");

-- CreateIndex
CREATE INDEX "crm_projects_tenantId_accountId_idx" ON "crm_projects"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "crm_projects_tenantId_deletedAt_idx" ON "crm_projects"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_projects_tenantId_projectNumber_key" ON "crm_projects"("tenantId", "projectNumber");

-- AddForeignKey
ALTER TABLE "crm_projects" ADD CONSTRAINT "crm_projects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_projects" ADD CONSTRAINT "crm_projects_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_projects" ADD CONSTRAINT "crm_projects_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SeedData: "Projeler" sayfasi 'crm' modulune bagli (bkz. core/modules/module-registry.ts,
-- her yeni CRM alt-fazinda kendi migration'inda ayni pattern - opportunities/quotes/vb.).
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('projects', 'crm', CURRENT_TIMESTAMP);
