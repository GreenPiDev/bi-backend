-- Ad-hoc (2026-09-19, bkz. docs/VARSAYIMLAR.md V37): 'price-lists' sayfasi
-- page-registry.ts'ten kaldirildi (PriceList modulu kaldirildi), orfan kalan
-- PageModuleAssignment satiri temizlenir.
DELETE FROM "page_module_assignments" WHERE "pageKey" = 'price-lists';
