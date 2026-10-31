-- AlterTable
ALTER TABLE "users" ADD COLUMN     "demoExpiresAt" TIMESTAMP(3),
ADD COLUMN     "isDemoUser" BOOLEAN NOT NULL DEFAULT false;
