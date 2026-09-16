-- AlterTable
ALTER TABLE "crm_contacts" ADD COLUMN     "department" TEXT,
ADD COLUMN     "extension" TEXT;

-- CreateTable
CREATE TABLE "crm_department_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_department_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_title_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_title_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_department_options_tenantId_label_key" ON "crm_department_options"("tenantId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "crm_title_options_tenantId_label_key" ON "crm_title_options"("tenantId", "label");

-- AddForeignKey
ALTER TABLE "crm_department_options" ADD CONSTRAINT "crm_department_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_title_options" ADD CONSTRAINT "crm_title_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
