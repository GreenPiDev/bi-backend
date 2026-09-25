-- AlterTable
ALTER TABLE "crm_quotes" ADD COLUMN     "leadTime" TEXT,
ADD COLUMN     "paymentMethod" TEXT;

-- CreateTable
CREATE TABLE "crm_payment_method_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_payment_method_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_payment_method_options_tenantId_label_key" ON "crm_payment_method_options"("tenantId", "label");

-- AddForeignKey
ALTER TABLE "crm_payment_method_options" ADD CONSTRAINT "crm_payment_method_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
