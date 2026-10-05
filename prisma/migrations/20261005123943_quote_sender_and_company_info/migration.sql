-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "address" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "crm_quotes" ADD COLUMN     "senderId" TEXT;

-- Mevcut tekliflerde gonderen olarak olusturan kullanici backfill edilir -
-- yeni tekliflerde kullanici bunu /teklifler/yeni'de degistirebilir.
UPDATE "crm_quotes" SET "senderId" = "createdById" WHERE "senderId" IS NULL;

-- AlterTable: QuoteTemplate'in sablon-bazli sabit sirket/gonderen alanlari
-- kaldirildi (bkz. schema.prisma doc comment'i) - Tenant.address/phone/email
-- ve Quote.senderId'ye tasindi.
ALTER TABLE "crm_quote_templates" DROP COLUMN "companyAddressLines",
DROP COLUMN "companyEmail",
DROP COLUMN "companyPhone",
DROP COLUMN "senderEmail",
DROP COLUMN "senderName",
DROP COLUMN "senderPhone",
DROP COLUMN "senderTitle";
