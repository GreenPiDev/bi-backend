-- SeedData: "Siparis / Satin Alma" (purchase-orders) ve "Stok" (stock) sayfalari
-- crm modulune bagli - bkz. docs/VARSAYIMLAR.md V27, ayni desen daha once
-- interactions/opportunities/products/price-lists/quotes/projects icin kullanildi
-- (migrations 20260906135714, 20260906183736, 20260907112934).
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('purchase-orders', 'crm', CURRENT_TIMESTAMP),
    ('stock', 'crm', CURRENT_TIMESTAMP);
