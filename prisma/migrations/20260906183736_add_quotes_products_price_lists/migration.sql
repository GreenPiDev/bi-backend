-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "PermissionAction" ADD VALUE 'APPROVE';

-- CreateTable
CREATE TABLE "crm_products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'adet',
    "minStockLevel" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_price_lists" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_price_list_items" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_price_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_product_discount_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "maxDiscountPct" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_product_discount_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_quotes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_quote_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discountNote" TEXT,
    "vatPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_products_tenantId_name_idx" ON "crm_products"("tenantId", "name");

-- CreateIndex
CREATE INDEX "crm_products_tenantId_deletedAt_idx" ON "crm_products"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "crm_price_lists_tenantId_deletedAt_idx" ON "crm_price_lists"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_price_list_items_priceListId_productId_key" ON "crm_price_list_items"("priceListId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_product_discount_policies_productId_key" ON "crm_product_discount_policies"("productId");

-- CreateIndex
CREATE INDEX "crm_quotes_tenantId_accountId_idx" ON "crm_quotes"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "crm_quotes_tenantId_status_idx" ON "crm_quotes"("tenantId", "status");

-- CreateIndex
CREATE INDEX "crm_quotes_tenantId_deletedAt_idx" ON "crm_quotes"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_quotes_tenantId_quoteNumber_key" ON "crm_quotes"("tenantId", "quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "crm_opportunities_quoteId_key" ON "crm_opportunities"("quoteId");

-- AddForeignKey
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_products" ADD CONSTRAINT "crm_products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_price_lists" ADD CONSTRAINT "crm_price_lists_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_price_list_items" ADD CONSTRAINT "crm_price_list_items_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "crm_price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_price_list_items" ADD CONSTRAINT "crm_price_list_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "crm_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_product_discount_policies" ADD CONSTRAINT "crm_product_discount_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_product_discount_policies" ADD CONSTRAINT "crm_product_discount_policies_productId_fkey" FOREIGN KEY ("productId") REFERENCES "crm_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "crm_price_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quote_items" ADD CONSTRAINT "crm_quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quote_items" ADD CONSTRAINT "crm_quote_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "crm_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- SeedData: Urunler/Fiyat Listeleri/Teklifler sayfalari crm modulune bagli - bkz.
-- docs/VARSAYIMLAR.md V27, ayni desen daha once interactions/opportunities icin kullanildi
-- (migration 20260906135714).
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('products', 'crm', CURRENT_TIMESTAMP),
    ('price-lists', 'crm', CURRENT_TIMESTAMP),
    ('quotes', 'crm', CURRENT_TIMESTAMP);
