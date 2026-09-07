-- CreateEnum
CREATE TYPE "DatasetSourceKind" AS ENUM ('UPLOAD', 'CRM_TABLE');

-- DropForeignKey
ALTER TABLE "datasets" DROP CONSTRAINT "datasets_dataSourceId_fkey";

-- AlterTable
ALTER TABLE "datasets" ADD COLUMN     "sourceKind" "DatasetSourceKind" NOT NULL DEFAULT 'UPLOAD',
ALTER COLUMN "dataSourceId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateView
-- Faz 11f (R1-R2, bkz. docs/VARSAYIMLAR.md V29): CRM_TABLE turundeki Dataset'lerin
-- fiziksel karsiligi. Sorgu motoru bu view'i tenantId'yi zorunlu WHERE olarak ekleyerek
-- okur (bkz. query-builder.ts tableRef/buildWhere). quantity/lineTotal bilerek
-- `double precision`'a cast edilir: pg suruculeri Postgres `numeric` tipini varsayilan
-- olarak string doner, oysa QueryResult sozlesmesi (CLAUDE.md SS6) NUMBER alanlarin
-- number donmesini varsayar - cast edilmezse KPI/grafik widget'lari sessizce bozuk
-- (string) deger alir. status da enum yerine text'e cast edilir (filtre esitliginde enum
-- tip uyusmazligini onlemek icin).
CREATE VIEW "crm_quote_line_report" AS
SELECT
  qi.id AS id,
  q."tenantId" AS "tenantId",
  q.id AS "quoteId",
  q."quoteNumber" AS "quoteNumber",
  q.status::text AS "status",
  q."createdAt" AS "createdAt",
  q."approvedAt" AS "approvedAt",
  a.name AS "accountName",
  u.name AS "salesRepName",
  p.name AS "productName",
  qi.quantity::double precision AS "quantity",
  ROUND(
    qi.quantity * qi."unitPrice" * (1 - qi."discountPct" / 100) * (1 + qi."vatPct" / 100),
    2
  )::double precision AS "lineTotal"
FROM "crm_quote_items" qi
JOIN "crm_quotes" q ON q.id = qi."quoteId"
JOIN "crm_accounts" a ON a.id = q."accountId"
JOIN "users" u ON u.id = q."createdById"
LEFT JOIN "crm_products" p ON p.id = qi."productId"
WHERE q."deletedAt" IS NULL;
