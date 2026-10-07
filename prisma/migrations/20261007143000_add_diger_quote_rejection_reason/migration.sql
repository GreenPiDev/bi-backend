-- DataMigration: built-in red sebebi listesine "Diger" eklendi (kullanici karari,
-- bkz. tenants.service.ts DEFAULT_QUOTE_REJECTION_REASONS). Onceki migration
-- (20261007141944_add_quote_rejection_reason_options) her mevcut tenant'i 8
-- built-in sebeple backfill etmisti, bu migration sadece eksik olan "Diger"
-- satirini tamamliyor - ON CONFLICT ile idempotent.
INSERT INTO "crm_quote_rejection_reason_options" ("id", "tenantId", "label", "createdAt")
SELECT gen_random_uuid(), t."id", 'Diğer', CURRENT_TIMESTAMP
FROM "tenants" t
ON CONFLICT ("tenantId", "label") DO NOTHING;
