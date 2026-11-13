-- CreateEnum
CREATE TYPE "KanbanColumn" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE');

-- CreateEnum
CREATE TYPE "KanbanPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'KANBAN_CARD_ASSIGNED';

-- CreateTable
CREATE TABLE "kanban_boards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerTenantId" TEXT,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "kanban_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kanban_cards" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "column" "KanbanColumn" NOT NULL DEFAULT 'TODO',
    "position" INTEGER NOT NULL DEFAULT 0,
    "priority" "KanbanPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" DATE,
    "assigneeUserId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByTenantId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kanban_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kanban_boards_tenantId_deletedAt_idx" ON "kanban_boards"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "kanban_boards_partnerTenantId_deletedAt_idx" ON "kanban_boards"("partnerTenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "kanban_cards_boardId_column_position_idx" ON "kanban_cards"("boardId", "column", "position");

-- CreateIndex
CREATE INDEX "kanban_cards_assigneeUserId_idx" ON "kanban_cards"("assigneeUserId");

-- AddForeignKey
ALTER TABLE "kanban_boards" ADD CONSTRAINT "kanban_boards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kanban_boards" ADD CONSTRAINT "kanban_boards_partnerTenantId_fkey" FOREIGN KEY ("partnerTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "kanban_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Kanban sayfasi cekirdek (core) module baglidir (kullanici karari).
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
  ('kanban', 'core', NOW())
ON CONFLICT DO NOTHING;
