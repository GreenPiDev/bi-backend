-- CreateTable
CREATE TABLE "crm_product_category_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_product_category_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_product_category_options_tenantId_label_key" ON "crm_product_category_options"("tenantId", "label");

-- AddForeignKey
ALTER TABLE "crm_product_category_options" ADD CONSTRAINT "crm_product_category_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
