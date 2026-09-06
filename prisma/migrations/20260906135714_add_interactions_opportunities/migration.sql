-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('CALL', 'VISIT', 'MEETING', 'EMAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "InteractionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('NEW', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST');

-- AlterTable
ALTER TABLE "crm_calendar_event_attendees" ADD COLUMN     "notifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "crm_interactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "type" "InteractionType" NOT NULL,
    "notes" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" "InteractionStatus" NOT NULL DEFAULT 'OPEN',
    "accountAutoCreated" BOOLEAN NOT NULL DEFAULT false,
    "contactAutoCreated" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_interaction_participants" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_interaction_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_opportunities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "interactionId" TEXT,
    "quoteId" TEXT,
    "name" TEXT NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'NEW',
    "estimatedValue" DECIMAL(14,2),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_interactions_tenantId_accountId_idx" ON "crm_interactions"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "crm_interactions_tenantId_occurredAt_idx" ON "crm_interactions"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "crm_interactions_tenantId_deletedAt_idx" ON "crm_interactions"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_opportunities_interactionId_key" ON "crm_opportunities"("interactionId");

-- CreateIndex
CREATE INDEX "crm_opportunities_tenantId_accountId_idx" ON "crm_opportunities"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "crm_opportunities_tenantId_stage_idx" ON "crm_opportunities"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "crm_opportunities_tenantId_deletedAt_idx" ON "crm_opportunities"("tenantId", "deletedAt");

-- AddForeignKey
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interaction_participants" ADD CONSTRAINT "crm_interaction_participants_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "crm_interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "crm_interactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SeedData: Gorusme/Firsat sayfalari crm modulune bagli - bkz. docs/VARSAYIMLAR.md V25,
-- calendar sayfasi icin ayni desen (migration 20260906093555).
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('interactions', 'crm', CURRENT_TIMESTAMP),
    ('opportunities', 'crm', CURRENT_TIMESTAMP);
