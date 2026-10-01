-- CreateTable
CREATE TABLE "crm_project_attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_project_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_project_attachments_tenantId_projectId_idx" ON "crm_project_attachments"("tenantId", "projectId");

-- AddForeignKey
ALTER TABLE "crm_project_attachments" ADD CONSTRAINT "crm_project_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_project_attachments" ADD CONSTRAINT "crm_project_attachments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "crm_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
