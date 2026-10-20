-- SeedData: "Anketler" (surveys) sayfasi crm modulune bagli - bkz. CLAUDE.md
-- Satis Sonrasi Destek anket sablonlari genislemesi, sales-orders/purchase-orders/stock
-- icin kullanilan ayni desen.
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('surveys', 'crm', CURRENT_TIMESTAMP);
