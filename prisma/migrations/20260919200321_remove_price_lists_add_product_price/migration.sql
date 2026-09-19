-- Ad-hoc (2026-09-19, bkz. docs/VARSAYIMLAR.md V37): PriceList/PriceListItem
-- kaldirildi, fiyat artik dogrudan Product uzerinde.

-- AlterTable: once yeni kolonlari ekle (asagidaki veri tasima adimi bunlari kullanir)
ALTER TABLE "crm_products" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'TRY',
ADD COLUMN     "price" DECIMAL(14,2);

-- Veri tasima: her urun icin varsayilan (isDefault=true) fiyat listesindeki fiyat
-- kazanir; orada yoksa urune ait herhangi bir fiyat listesi kaleminden (en eski) alinir.
-- Kullanici onayli karar (bkz. docs/VARSAYIMLAR.md V37).
UPDATE "crm_products" p
SET "price" = sub.unit_price
FROM (
  SELECT DISTINCT ON (pli."productId") pli."productId", pli."unitPrice" AS unit_price
  FROM "crm_price_list_items" pli
  JOIN "crm_price_lists" pl ON pl.id = pli."priceListId"
  ORDER BY pli."productId", pl."isDefault" DESC, pli."createdAt" ASC
) sub
WHERE p.id = sub."productId";

-- DropForeignKey
ALTER TABLE "crm_price_list_items" DROP CONSTRAINT "crm_price_list_items_priceListId_fkey";

-- DropForeignKey
ALTER TABLE "crm_price_list_items" DROP CONSTRAINT "crm_price_list_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "crm_price_lists" DROP CONSTRAINT "crm_price_lists_productListId_fkey";

-- DropForeignKey
ALTER TABLE "crm_price_lists" DROP CONSTRAINT "crm_price_lists_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "crm_quotes" DROP CONSTRAINT "crm_quotes_priceListId_fkey";

-- AlterTable
ALTER TABLE "crm_quotes" DROP COLUMN "priceListId";

-- DropTable
DROP TABLE "crm_price_list_items";

-- DropTable
DROP TABLE "crm_price_lists";
