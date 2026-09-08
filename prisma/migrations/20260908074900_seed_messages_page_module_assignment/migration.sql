-- SeedData: "Mesajlar" (messages) sayfasi crm modulune bagli - bkz. docs/VARSAYIMLAR.md V35,
-- ayni desen daha once interactions/opportunities/products/price-lists/quotes/projects/
-- purchase-orders/stock icin kullanildi.
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('messages', 'crm', CURRENT_TIMESTAMP);
