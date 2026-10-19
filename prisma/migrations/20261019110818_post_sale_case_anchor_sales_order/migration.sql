-- PostSaleCase artik Quote'a degil SalesOrder'a ankorlu (bkz. docs/VARSAYIMLAR.md V58):
-- tetikleyici "teklif onaylandi" degil "bir satis siparisi olustu" oldu. quoteId nullable
-- oluyor (teklifsiz manuel SalesOrder'lar icin de bir PostSaleCase acilabilir).

-- DropForeignKey
ALTER TABLE "crm_post_sale_cases" DROP CONSTRAINT "crm_post_sale_cases_quoteId_fkey";

-- AlterTable: once nullable olarak ekle, backfill'den sonra NOT NULL'a cevir.
ALTER TABLE "crm_post_sale_cases" ADD COLUMN     "salesOrderId" TEXT,
ALTER COLUMN "quoteId" DROP NOT NULL;

-- Backfill: mevcut her PostSaleCase'in quoteId'si uzerinden eslesen SalesOrder'i bul.
-- ensurePostSaleCase ve ensureSalesOrder her zaman ayni iki noktadan (Quote APPROVED
-- gecisi) birlikte tetiklendigi icin bu eslesme veri kaybi olmadan tamdir (dogrulandi:
-- 2026-10-19'da mevcut 8 PostSaleCase'in 8'i de eslesen bir SalesOrder'a sahip).
UPDATE "crm_post_sale_cases" p
SET "salesOrderId" = so."id"
FROM "crm_sales_orders" so
WHERE so."quoteId" = p."quoteId";

ALTER TABLE "crm_post_sale_cases" ALTER COLUMN "salesOrderId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "crm_post_sale_cases_salesOrderId_key" ON "crm_post_sale_cases"("salesOrderId");

-- AddForeignKey
ALTER TABLE "crm_post_sale_cases" ADD CONSTRAINT "crm_post_sale_cases_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "crm_sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_post_sale_cases" ADD CONSTRAINT "crm_post_sale_cases_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
