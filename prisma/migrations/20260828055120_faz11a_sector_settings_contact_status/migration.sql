-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "crm_accounts" ADD COLUMN     "accountTypes" "AccountType"[] DEFAULT ARRAY[]::"AccountType"[];

-- AlterTable
ALTER TABLE "crm_contacts" ADD COLUMN     "inactivityNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "lastContactedAt" TIMESTAMP(3),
ADD COLUMN     "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "crm_sector_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_sector_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_sector_options_tenantId_label_key" ON "crm_sector_options"("tenantId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_settings_tenantId_key_key" ON "tenant_settings"("tenantId", "key");

-- CreateIndex
CREATE INDEX "crm_contacts_tenantId_status_idx" ON "crm_contacts"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "crm_sector_options" ADD CONSTRAINT "crm_sector_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
