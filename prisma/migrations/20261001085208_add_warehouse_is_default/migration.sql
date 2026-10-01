-- AlterTable
ALTER TABLE "crm_warehouses" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- DataMigration: her tenant'in en eski (ilk olusturulan) deposu varsayilan olarak
-- isaretlenir - aksi halde tek-varsayilan kurali olan bir alan hic set edilmemis
-- olarak baslardi (bkz. ProductList.isDefault ile ayni desen, migration
-- 20260915093804_add_product_lists).
UPDATE "crm_warehouses" w
SET "isDefault" = true
FROM (
    SELECT DISTINCT ON ("tenantId") id
    FROM "crm_warehouses"
    ORDER BY "tenantId", "createdAt" ASC
) first
WHERE w."id" = first."id";
