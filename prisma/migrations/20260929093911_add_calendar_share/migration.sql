-- CreateTable
CREATE TABLE "crm_calendar_shares" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_calendar_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_calendar_shares_tenantId_ownerId_viewerId_key" ON "crm_calendar_shares"("tenantId", "ownerId", "viewerId");

-- AddForeignKey
ALTER TABLE "crm_calendar_shares" ADD CONSTRAINT "crm_calendar_shares_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
