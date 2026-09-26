-- CreateTable
CREATE TABLE "crm_message_attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_message_attachments_tenantId_messageId_idx" ON "crm_message_attachments"("tenantId", "messageId");

-- AddForeignKey
ALTER TABLE "crm_message_attachments" ADD CONSTRAINT "crm_message_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_message_attachments" ADD CONSTRAINT "crm_message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "crm_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
