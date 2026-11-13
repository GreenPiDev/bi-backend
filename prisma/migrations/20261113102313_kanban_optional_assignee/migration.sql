-- DropForeignKey
ALTER TABLE "kanban_cards" DROP CONSTRAINT "kanban_cards_assigneeUserId_fkey";

-- AlterTable
ALTER TABLE "kanban_cards" ALTER COLUMN "assigneeUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
