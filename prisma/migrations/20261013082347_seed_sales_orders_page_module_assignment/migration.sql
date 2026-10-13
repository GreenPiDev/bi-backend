-- SeedData: "Satis Siparisleri" (sales-orders) sayfasi crm modulune bagli - bkz. CLAUDE.md
-- Ad-hoc Satis Siparisi genislemesi, ayni desen daha once purchase-orders/stock/messages
-- icin kullanildi.
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('sales-orders', 'crm', CURRENT_TIMESTAMP);
