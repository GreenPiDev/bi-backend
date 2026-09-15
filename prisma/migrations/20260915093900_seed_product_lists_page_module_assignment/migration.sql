-- SeedData: "Urun Listeleri" (product-lists) sayfasi crm modulune bagli - bkz.
-- docs/VARSAYIMLAR.md V36, ayni desen daha once purchase-orders/stock icin kullanildi
-- (migration 20260907120600).
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('product-lists', 'crm', CURRENT_TIMESTAMP);
