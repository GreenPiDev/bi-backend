-- AlterTable
ALTER TABLE "crm_messages" ADD COLUMN     "subject" TEXT;

-- Backfill: gecmis mesajlarda konu alani hic toplanmiyordu, govdenin ilk 80
-- karakteri makul bir yer tutucu olarak kullanilir.
UPDATE "crm_messages" SET "subject" = left("body", 80) WHERE "subject" IS NULL;

ALTER TABLE "crm_messages" ALTER COLUMN "subject" SET NOT NULL;
