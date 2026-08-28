-- Eski UserRole enum'ina bagli veri, migrate-roles.ts calistirilarak Role/RolePermission/
-- user_roles tablolarina tasindi (bkz. docs/PLAN_ROL_YONETIMI.md SS2). Bu migration
-- artik ihtiyac duyulmayan legacy kolonlari ve enum'i kaldirir.

-- AlterTable
ALTER TABLE "users" DROP COLUMN "role";

-- AlterTable
ALTER TABLE "invitations" DROP COLUMN "role";

-- DropEnum
DROP TYPE "UserRole";
