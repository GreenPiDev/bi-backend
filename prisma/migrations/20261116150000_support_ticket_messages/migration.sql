-- Teknik Destek: tek cevap alanindan karsilikli yazismaya gecis (bkz. docs/VARSAYIMLAR.md V84)

-- CreateEnum
CREATE TYPE "SupportTicketAuthorType" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "support_ticket_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorType" "SupportTicketAuthorType" NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_ticket_messages_ticketId_createdAt_idx" ON "support_ticket_messages"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mevcut tekil cevaplari yazismaya aktar - veri kaybi olmasin.
-- md5 tabanli id: gen_random_uuid() Postgres 13 oncesinde yok.
INSERT INTO "support_ticket_messages" ("id", "ticketId", "authorType", "authorId", "body", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", 'ADMIN', "repliedById", "adminReply", COALESCE("repliedAt", "updatedAt")
FROM "support_tickets"
WHERE "adminReply" IS NOT NULL;

-- Eski tekil cevap alanlarini kaldir
ALTER TABLE "support_tickets" DROP CONSTRAINT "support_tickets_repliedById_fkey";
ALTER TABLE "support_tickets" DROP COLUMN "adminReply",
DROP COLUMN "repliedAt",
DROP COLUMN "repliedById";
