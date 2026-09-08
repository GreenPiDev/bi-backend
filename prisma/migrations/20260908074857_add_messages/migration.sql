-- CreateEnum
CREATE TYPE "MessageRelatedEntity" AS ENUM ('PROJECT', 'QUOTE', 'INTERACTION');

-- CreateEnum
CREATE TYPE "MessageRecipientKind" AS ENUM ('TO', 'CC');

-- CreateTable
CREATE TABLE "crm_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relatedEntity" "MessageRelatedEntity",
    "relatedEntityId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_message_recipients" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "MessageRecipientKind" NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_message_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_messages_tenantId_relatedEntity_relatedEntityId_idx" ON "crm_messages"("tenantId", "relatedEntity", "relatedEntityId");

-- CreateIndex
CREATE INDEX "crm_messages_tenantId_sentAt_idx" ON "crm_messages"("tenantId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_message_recipients_messageId_userId_kind_key" ON "crm_message_recipients"("messageId", "userId", "kind");

-- AddForeignKey
ALTER TABLE "crm_messages" ADD CONSTRAINT "crm_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_message_recipients" ADD CONSTRAINT "crm_message_recipients_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "crm_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
