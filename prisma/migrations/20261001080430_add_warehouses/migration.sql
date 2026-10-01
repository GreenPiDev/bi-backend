-- CreateTable
CREATE TABLE "crm_warehouses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_warehouses_tenantId_idx" ON "crm_warehouses"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_warehouses_tenantId_name_key" ON "crm_warehouses"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "crm_warehouses" ADD CONSTRAINT "crm_warehouses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: nullable olarak ekle, asagida backfill edilip NOT NULL yapilacak
ALTER TABLE "crm_stock_items" ADD COLUMN     "warehouseId" TEXT;

-- DataMigration: crm_stock_items'ta satiri olan her tenant icin otomatik bir
-- "Ana Depo" Warehouse olustur, mevcut tum stok kayitlarini oraya bagla
-- (bkz. docs/VARSAYIMLAR.md, ayni desen daha once urun listesi icin kullanildi:
-- migration 20260915093804_add_product_lists).
INSERT INTO "crm_warehouses" ("id", "tenantId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), t."tenantId", 'Ana Depo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "tenantId" FROM "crm_stock_items") t;

UPDATE "crm_stock_items" si
SET "warehouseId" = w."id"
FROM "crm_warehouses" w
WHERE w."tenantId" = si."tenantId" AND w."name" = 'Ana Depo';

-- AlterTable: backfill tamamlandi, artik zorunlu kolona cevir
ALTER TABLE "crm_stock_items" ALTER COLUMN "warehouseId" SET NOT NULL;

-- DropIndex: eski (tenantId, productId) tekillik kisiti artik gecerli degil -
-- bir urun birden fazla depoda ayri satirlarla bulunabilir
DROP INDEX "crm_stock_items_tenantId_productId_key";

-- CreateIndex
CREATE UNIQUE INDEX "crm_stock_items_tenantId_productId_warehouseId_key" ON "crm_stock_items"("tenantId", "productId", "warehouseId");

-- CreateIndex
CREATE INDEX "crm_stock_items_tenantId_warehouseId_idx" ON "crm_stock_items"("tenantId", "warehouseId");

-- AddForeignKey
ALTER TABLE "crm_stock_items" ADD CONSTRAINT "crm_stock_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "crm_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
