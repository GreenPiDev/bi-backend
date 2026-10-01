-- SeedData: "Depolar" (warehouses) sayfasi crm modulune bagli - stock/products ile
-- ayni desen (bkz. migration 20260915093900_seed_product_lists_page_module_assignment).
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('warehouses', 'crm', CURRENT_TIMESTAMP);
