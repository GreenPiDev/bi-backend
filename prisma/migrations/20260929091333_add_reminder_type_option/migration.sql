-- AlterTable
ALTER TABLE "crm_calendar_events" ADD COLUMN     "reminderType" TEXT;

-- CreateTable
CREATE TABLE "crm_reminder_type_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_reminder_type_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_reminder_type_options_tenantId_label_key" ON "crm_reminder_type_options"("tenantId", "label");

-- AddForeignKey
ALTER TABLE "crm_reminder_type_options" ADD CONSTRAINT "crm_reminder_type_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
