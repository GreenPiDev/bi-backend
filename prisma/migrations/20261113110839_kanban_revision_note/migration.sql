-- AlterTable
ALTER TABLE "kanban_cards" ADD COLUMN     "revisionNote" TEXT,
ADD COLUMN     "revisionNoteAt" TIMESTAMP(3),
ADD COLUMN     "revisionNoteById" TEXT;

-- AddForeignKey
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_revisionNoteById_fkey" FOREIGN KEY ("revisionNoteById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
