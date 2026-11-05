-- Per-user archive for messages: sender side and recipient side are independent.
ALTER TABLE "crm_messages" ADD COLUMN "senderArchivedAt" TIMESTAMP(3);
ALTER TABLE "crm_message_recipients" ADD COLUMN "archivedAt" TIMESTAMP(3);
