-- Per-user soft delete (trash) for messages: sender side and recipient side are independent.
ALTER TABLE "crm_messages" ADD COLUMN "senderDeletedAt" TIMESTAMP(3);
ALTER TABLE "crm_message_recipients" ADD COLUMN "deletedAt" TIMESTAMP(3);
