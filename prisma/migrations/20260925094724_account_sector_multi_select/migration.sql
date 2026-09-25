-- Account.sector: tekli metin -> coklu secim (String[]), bkz. VARSAYIMLAR V41.
-- Mevcut tekli deger, dizinin tek elemani olarak korunur (veri kaybi yok).
ALTER TABLE "crm_accounts" ADD COLUMN "sector_new" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "crm_accounts"
SET "sector_new" = ARRAY["sector"]::TEXT[]
WHERE "sector" IS NOT NULL AND "sector" <> '';

ALTER TABLE "crm_accounts" DROP COLUMN "sector";
ALTER TABLE "crm_accounts" RENAME COLUMN "sector_new" TO "sector";
