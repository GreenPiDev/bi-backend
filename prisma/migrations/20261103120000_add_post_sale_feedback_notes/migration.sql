-- CreateTable
CREATE TABLE "crm_post_sale_feedback_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "postSaleCaseId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_post_sale_feedback_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_post_sale_feedback_notes_tenantId_postSaleCaseId_create_idx" ON "crm_post_sale_feedback_notes"("tenantId", "postSaleCaseId", "createdAt");

-- AddForeignKey
ALTER TABLE "crm_post_sale_feedback_notes" ADD CONSTRAINT "crm_post_sale_feedback_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_post_sale_feedback_notes" ADD CONSTRAINT "crm_post_sale_feedback_notes_postSaleCaseId_fkey" FOREIGN KEY ("postSaleCaseId") REFERENCES "crm_post_sale_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Eski tekil feedbackNote degerlerini yeni tabloya tasi
INSERT INTO "crm_post_sale_feedback_notes" ("id", "tenantId", "postSaleCaseId", "text", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "tenantId", "id", "feedbackNote", COALESCE("feedbackReceivedAt", "updatedAt"), COALESCE("feedbackReceivedAt", "updatedAt")
FROM "crm_post_sale_cases"
WHERE "feedbackNote" IS NOT NULL AND btrim("feedbackNote") <> '';
