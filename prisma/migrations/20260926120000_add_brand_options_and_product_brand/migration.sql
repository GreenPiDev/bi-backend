-- AlterTable
ALTER TABLE "crm_products" ADD COLUMN     "brand" TEXT;

-- CreateTable
CREATE TABLE "crm_brand_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_brand_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_brand_options_tenantId_label_key" ON "crm_brand_options"("tenantId", "label");

-- AddForeignKey
ALTER TABLE "crm_brand_options" ADD CONSTRAINT "crm_brand_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
