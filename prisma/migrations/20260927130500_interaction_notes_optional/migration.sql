-- AlterTable: "Konu" (subject) eklendikten sonra "Notlar" artik zorunlu degil.
ALTER TABLE "crm_interactions" ALTER COLUMN "notes" DROP NOT NULL;
