-- AlterTable
ALTER TABLE "crm_quote_items" ADD COLUMN     "costPriceAtSale" DECIMAL(14,4);

-- Backfill: var olan satirlar icin gercek "o anki" maliyet bilinmiyor (hic snapshot
-- alinmamisti) - en yakin tahmin olarak urunun BUGUNKU avgCost'u kopyalanir. Bundan
-- sonra olusturulan/guncellenen satirlar gercek zamaninda snapshot alacak
-- (quotes.service.ts resolveItems). Bkz. docs/VARSAYIMLAR.md.
UPDATE "crm_quote_items" AS qi
SET "costPriceAtSale" = p."avgCost"
FROM "crm_products" AS p
WHERE qi."productId" = p."id" AND qi."costPriceAtSale" IS NULL;
