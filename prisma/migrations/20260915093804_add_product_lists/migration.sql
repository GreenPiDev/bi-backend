-- CreateTable
CREATE TABLE "crm_product_lists" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_product_lists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_product_lists_tenantId_deletedAt_idx" ON "crm_product_lists"("tenantId", "deletedAt");

-- AddForeignKey
ALTER TABLE "crm_product_lists" ADD CONSTRAINT "crm_product_lists_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: nullable olarak ekle, asagida backfill edilip NOT NULL yapilacak
ALTER TABLE "crm_products" ADD COLUMN     "productListId" TEXT;
ALTER TABLE "crm_price_lists" ADD COLUMN     "productListId" TEXT;

-- DataMigration: crm_products/crm_price_lists'te satiri olan her tenant icin otomatik
-- bir "Genel" ProductList olustur, mevcut tum urun/fiyat listesi kayitlarini oraya bagla
-- (bkz. docs/VARSAYIMLAR.md V36).
INSERT INTO "crm_product_lists" ("id", "tenantId", "name", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid(), t."tenantId", 'Genel', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "tenantId" FROM "crm_products"
    UNION
    SELECT DISTINCT "tenantId" FROM "crm_price_lists"
) t;

UPDATE "crm_products" p
SET "productListId" = pl."id"
FROM "crm_product_lists" pl
WHERE pl."tenantId" = p."tenantId" AND pl."name" = 'Genel';

UPDATE "crm_price_lists" p
SET "productListId" = pl."id"
FROM "crm_product_lists" pl
WHERE pl."tenantId" = p."tenantId" AND pl."name" = 'Genel';

-- AlterTable: backfill tamamlandi, artik zorunlu kolona cevir
ALTER TABLE "crm_products" ALTER COLUMN "productListId" SET NOT NULL;
ALTER TABLE "crm_price_lists" ALTER COLUMN "productListId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "crm_price_lists_tenantId_productListId_idx" ON "crm_price_lists"("tenantId", "productListId");

-- CreateIndex
CREATE INDEX "crm_products_tenantId_productListId_idx" ON "crm_products"("tenantId", "productListId");

-- AddForeignKey
ALTER TABLE "crm_products" ADD CONSTRAINT "crm_products_productListId_fkey" FOREIGN KEY ("productListId") REFERENCES "crm_product_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_price_lists" ADD CONSTRAINT "crm_price_lists_productListId_fkey" FOREIGN KEY ("productListId") REFERENCES "crm_product_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
