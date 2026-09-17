-- CreateTable
CREATE TABLE "crm_message_stars" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_message_stars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_message_stars_tenantId_userId_idx" ON "crm_message_stars"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_message_stars_tenantId_userId_conversationId_key" ON "crm_message_stars"("tenantId", "userId", "conversationId");

-- AddForeignKey
ALTER TABLE "crm_message_stars" ADD CONSTRAINT "crm_message_stars_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
