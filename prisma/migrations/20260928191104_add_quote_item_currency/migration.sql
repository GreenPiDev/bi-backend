-- AlterTable
ALTER TABLE "crm_quote_items" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'TRY';

-- Backfill: mevcut satirlar icin en iyi tahmin, urunun SU ANKI currency'si (gecmisteki
-- gercek deger saklanmadigi icin geri getirilemez - bundan sonraki create/update
-- resolveItems() ile dogru snapshot'i alacak).
UPDATE "crm_quote_items" qi
SET "currency" = p."currency"
FROM "crm_products" p
WHERE qi."productId" = p.id;

-- CreateView (replace)
-- Faz 11f view'ine (bkz. 20260907060349_add_crm_report_dataset_source_kind) currency
-- kolonu eklendi - coklu para birimli tekliflerde lineTotal'in yanlislikla tek para
-- biriminde toplanmasini onlemek icin (bkz. docs/VARSAYIMLAR.md, quote coklu para
-- birimi karari).
CREATE OR REPLACE VIEW "crm_quote_line_report" AS
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
  )::double precision AS "lineTotal",
  qi."currency" AS "currency"
FROM "crm_quote_items" qi
JOIN "crm_quotes" q ON q.id = qi."quoteId"
JOIN "crm_accounts" a ON a.id = q."accountId"
JOIN "users" u ON u.id = q."createdById"
LEFT JOIN "crm_products" p ON p.id = qi."productId"
WHERE q."deletedAt" IS NULL;

-- DataMigration: CrmReportProvisioningService yalnizca YENI tenant'lar icin dataset
-- provision eder (bkz. provisionForTenant'in "existing ise atla" davranisi) - zaten var
-- olan crm_quote_line_report dataset'lerine yeni currency kolonunu tek seferlik burada
-- ekliyoruz, boylece mevcut tenant'lar da yeniden acip kapatmadan bu alani gorur.
INSERT INTO "dataset_fields" ("id", "datasetId", "sourceName", "name", "label", "type", "role", "ordinal")
SELECT
  gen_random_uuid(),
  d.id,
  'currency',
  'currency',
  'Para Birimi',
  'STRING',
  'DIMENSION',
  (SELECT COALESCE(MAX(df."ordinal"), 0) + 1 FROM "dataset_fields" df WHERE df."datasetId" = d.id)
FROM "datasets" d
WHERE d."physicalTable" = 'crm_quote_line_report'
  AND d."sourceKind" = 'CRM_TABLE'
  AND NOT EXISTS (
    SELECT 1 FROM "dataset_fields" df2
    WHERE df2."datasetId" = d.id AND df2."name" = 'currency'
  );

-- "Satır Tutarı (₺)" etiketi artik yanlis (coklu para birimi mumkun) - genel etikete
-- indirgendi.
UPDATE "dataset_fields" df
SET "label" = 'Satır Tutarı'
FROM "datasets" d
WHERE df."datasetId" = d.id
  AND d."physicalTable" = 'crm_quote_line_report'
  AND df."name" = 'lineTotal'
  AND df."label" = 'Satır Tutarı (₺)';
