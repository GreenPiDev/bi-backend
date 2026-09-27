-- AlterTable
ALTER TABLE "crm_interactions" ADD COLUMN     "customFields" JSONB NOT NULL DEFAULT '{}';
