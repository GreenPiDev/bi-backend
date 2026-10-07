-- AlterTable
ALTER TABLE "crm_quote_status_history" ADD COLUMN     "reason" TEXT;

-- DataMigration: bu kolon eklenmeden once REJECTED satirlari icin red sebebi
-- gecici olarak "note" alanina yaziliyordu (bkz. ad-hoc "91 reddedilmis teklife
-- sebep dagit" backfill'i). Bu veriyi dogru kolona tasi - REJECTED notu artik
-- serbest ek aciklama anlamina geliyor, eski deger gercekte bir sebepti.
UPDATE "crm_quote_status_history"
SET "reason" = "note", "note" = NULL
WHERE status = 'REJECTED' AND "note" IS NOT NULL;
