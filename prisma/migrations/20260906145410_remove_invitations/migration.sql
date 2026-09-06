-- DropForeignKey
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_tenantId_fkey";

-- DropTable
DROP TABLE "invitations";
