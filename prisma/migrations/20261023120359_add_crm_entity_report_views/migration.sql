-- Kullanici istegiyle (bkz. docs/VARSAYIMLAR.md): chatbot'un (ve /datasets'in) sadece
-- teklif satirlarini degil, ana CRM varliklarini da sorgulayabilmesi icin
-- crm_quote_line_report (V29) deseniyle ayni sekilde ek, paylasimli semadaki view'lar.
-- Hepsi tenantId'yi acik bir kolon olarak tasiyor (query-builder.ts zorunlu WHERE
-- "tenantId" = $N enjekte ediyor), numeric kolonlar `numeric` -> string donusumunu
-- onlemek icin ::double precision'a, enum kolonlar filtre esitligi icin ::text'e
-- cast edilir (V29'daki ayni gerekce).

CREATE VIEW "crm_account_report" AS
SELECT
  a.id AS id,
  a."tenantId" AS "tenantId",
  a.name AS "accountName",
  array_to_string(a.sector, ', ') AS "sector",
  ('CUSTOMER' = ANY (a."accountTypes")) AS "isCustomer",
  ('SUPPLIER' = ANY (a."accountTypes")) AS "isSupplier",
  a.city AS "city",
  a."createdAt" AS "createdAt"
FROM "crm_accounts" a
WHERE a."deletedAt" IS NULL;

CREATE VIEW "crm_contact_report" AS
SELECT
  c.id AS id,
  c."tenantId" AS "tenantId",
  (c."firstName" || ' ' || c."lastName") AS "contactName",
  a.name AS "accountName",
  c.status::text AS "status",
  c."lastContactedAt" AS "lastContactedAt",
  c."createdAt" AS "createdAt"
FROM "crm_contacts" c
LEFT JOIN "crm_accounts" a ON a.id = c."accountId"
WHERE c."deletedAt" IS NULL;

CREATE VIEW "crm_interaction_report" AS
SELECT
  i.id AS id,
  i."tenantId" AS "tenantId",
  a.name AS "accountName",
  (co."firstName" || ' ' || co."lastName") AS "contactName",
  i.type AS "type",
  i.status::text AS "status",
  i."occurredAt" AS "occurredAt",
  u.name AS "createdByName"
FROM "crm_interactions" i
LEFT JOIN "crm_accounts" a ON a.id = i."accountId"
LEFT JOIN "crm_contacts" co ON co.id = i."contactId"
LEFT JOIN "users" u ON u.id = i."createdById"
WHERE i."deletedAt" IS NULL AND i."parentInteractionId" IS NULL;

CREATE VIEW "crm_opportunity_report" AS
SELECT
  o.id AS id,
  o."tenantId" AS "tenantId",
  a.name AS "accountName",
  o.name AS "opportunityName",
  o.stage::text AS "stage",
  COALESCE(o."estimatedValue", 0)::double precision AS "estimatedValue",
  o."createdAt" AS "createdAt"
FROM "crm_opportunities" o
JOIN "crm_accounts" a ON a.id = o."accountId"
WHERE o."deletedAt" IS NULL;

CREATE VIEW "crm_project_report" AS
SELECT
  p.id AS id,
  p."tenantId" AS "tenantId",
  p."projectNumber" AS "projectNumber",
  a.name AS "accountName",
  p.name AS "projectName",
  p."estimatedBudget"::double precision AS "estimatedBudget",
  COALESCE(p."actualCost", 0)::double precision AS "actualCost",
  p."createdAt" AS "createdAt"
FROM "crm_projects" p
JOIN "crm_accounts" a ON a.id = p."accountId"
WHERE p."deletedAt" IS NULL;

CREATE VIEW "crm_sales_order_report" AS
SELECT
  so.id AS id,
  so."tenantId" AS "tenantId",
  so."orderNumber" AS "orderNumber",
  a.name AS "accountName",
  so.status::text AS "status",
  COALESCE((
    SELECT SUM(ROUND(soi.quantity * soi."unitPrice" * (1 - soi."discountPct" / 100) * (1 + soi."vatPct" / 100), 2))
    FROM "crm_sales_order_items" soi
    WHERE soi."salesOrderId" = so.id AND soi."isCancelled" = false
  ), 0)::double precision AS "totalAmount",
  so."createdAt" AS "createdAt"
FROM "crm_sales_orders" so
JOIN "crm_accounts" a ON a.id = so."accountId";

CREATE VIEW "crm_purchase_order_report" AS
SELECT
  po.id AS id,
  po."tenantId" AS "tenantId",
  po."orderNumber" AS "orderNumber",
  a.name AS "accountName",
  po.status::text AS "status",
  po."createdAt" AS "createdAt"
FROM "crm_purchase_orders" po
LEFT JOIN "crm_quotes" q ON q.id = po."quoteId"
LEFT JOIN "crm_accounts" a ON a.id = q."accountId"
WHERE po."deletedAt" IS NULL;

CREATE VIEW "crm_stock_report" AS
SELECT
  si.id AS id,
  si."tenantId" AS "tenantId",
  p.name AS "productName",
  w.name AS "warehouseName",
  si.quantity::double precision AS "quantity",
  COALESCE(p."minStockLevel", 0)::double precision AS "minStockLevel",
  COALESCE(p."avgCost", 0)::double precision AS "avgCost"
FROM "crm_stock_items" si
JOIN "crm_products" p ON p.id = si."productId"
JOIN "crm_warehouses" w ON w.id = si."warehouseId"
WHERE p."deletedAt" IS NULL;

CREATE VIEW "crm_product_report" AS
SELECT
  p.id AS id,
  p."tenantId" AS "tenantId",
  p.name AS "productName",
  p.category AS "category",
  p.brand AS "brand",
  COALESCE(p.price, 0)::double precision AS "price",
  COALESCE(p."avgCost", 0)::double precision AS "avgCost",
  p.currency AS "currency",
  p."createdAt" AS "createdAt"
FROM "crm_products" p
WHERE p."deletedAt" IS NULL;
