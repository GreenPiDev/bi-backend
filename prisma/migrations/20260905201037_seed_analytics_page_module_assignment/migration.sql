-- SeedData: "Panolar" (dashboards) ve "Veri Kumeleri" (datasets) sayfalari artik
-- kapatilabilir bir modul olan 'analytics'e (Veri Analitigi) bagli - bkz.
-- core/modules/module-registry.ts, docs/VARSAYIMLAR.md V21.
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('dashboards', 'analytics', CURRENT_TIMESTAMP),
    ('datasets', 'analytics', CURRENT_TIMESTAMP);
