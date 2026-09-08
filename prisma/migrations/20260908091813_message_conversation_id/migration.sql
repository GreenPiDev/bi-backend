-- AlterTable
ALTER TABLE "crm_messages" ADD COLUMN     "conversationId" TEXT;

-- Backfill: her mevcut mesaj kendi tek-mesajlik konusmasinin koku olur (kendi id'sini kullanir)
UPDATE "crm_messages" SET "conversationId" = "id" WHERE "conversationId" IS NULL;

ALTER TABLE "crm_messages" ALTER COLUMN "conversationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "crm_messages_tenantId_conversationId_idx" ON "crm_messages"("tenantId", "conversationId");
