-- CreateEnum
CREATE TYPE "NoteColor" AS ENUM ('YELLOW', 'BLUE', 'RED', 'GREEN', 'PURPLE');

-- CreateTable
CREATE TABLE "crm_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "color" "NoteColor" NOT NULL DEFAULT 'YELLOW',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_notes_tenantId_deletedAt_idx" ON "crm_notes"("tenantId", "deletedAt");

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
