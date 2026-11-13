-- CreateTable
CREATE TABLE "kanban_card_progress_notes" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kanban_card_progress_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kanban_card_progress_notes_cardId_createdAt_idx" ON "kanban_card_progress_notes"("cardId", "createdAt");

-- AddForeignKey
ALTER TABLE "kanban_card_progress_notes" ADD CONSTRAINT "kanban_card_progress_notes_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "kanban_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kanban_card_progress_notes" ADD CONSTRAINT "kanban_card_progress_notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
