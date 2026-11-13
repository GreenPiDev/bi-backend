-- Revize notlari karttaki tek alandan ayri bir gecmis tablosuna tasiniyor:
-- her Incelemede -> Devam Ediyor geri cekilisi yeni bir satir olur.

-- CreateTable
CREATE TABLE "kanban_card_revisions" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kanban_card_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kanban_card_revisions_cardId_createdAt_idx" ON "kanban_card_revisions"("cardId", "createdAt");

-- AddForeignKey
ALTER TABLE "kanban_card_revisions" ADD CONSTRAINT "kanban_card_revisions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "kanban_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kanban_card_revisions" ADD CONSTRAINT "kanban_card_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mevcut (tekil) revize notlarini gecmise aktar - veri kaybi olmasin.
INSERT INTO "kanban_card_revisions" ("id", "cardId", "note", "createdById", "createdAt")
-- md5 tabanli id: gen_random_uuid() Postgres 13 oncesinde yok; prod surumunden bagimsiz calissin.
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", "revisionNote", "revisionNoteById", COALESCE("revisionNoteAt", "updatedAt")
FROM "kanban_cards"
WHERE "revisionNote" IS NOT NULL;

-- Eski tekil alanlari kaldir
ALTER TABLE "kanban_cards" DROP CONSTRAINT "kanban_cards_revisionNoteById_fkey";
ALTER TABLE "kanban_cards" DROP COLUMN "revisionNote",
DROP COLUMN "revisionNoteAt",
DROP COLUMN "revisionNoteById";
