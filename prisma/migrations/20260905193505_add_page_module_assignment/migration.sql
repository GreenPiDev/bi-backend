-- CreateTable
CREATE TABLE "page_module_assignments" (
    "pageKey" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_module_assignments_pkey" PRIMARY KEY ("pageKey","moduleKey")
);

-- SeedData: bugune kadar page-registry.ts'te hardcoded olan requiresModule
-- degerlerini koru, aksi halde accounts/contacts nav'da herkese acik gorunur.
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('accounts', 'crm', CURRENT_TIMESTAMP),
    ('contacts', 'crm', CURRENT_TIMESTAMP);
