-- CreateEnum
CREATE TYPE "DrawingTemplateType" AS ENUM ('AG_BACKPLATE');

-- CreateEnum
CREATE TYPE "DrawingStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateTable
CREATE TABLE "crm_product_drawing_specs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "widthMm" DECIMAL(10,2),
    "heightMm" DECIMAL(10,2),
    "depthMm" DECIMAL(10,2),
    "libraryComponentKey" TEXT,
    "connectionPoints" JSONB,
    "bandOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_product_drawing_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_drawing_library_components" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultWidthMm" DECIMAL(10,2) NOT NULL,
    "defaultHeightMm" DECIMAL(10,2) NOT NULL,
    "symbol" JSONB,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_drawing_library_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_drawing_panel_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DrawingTemplateType" NOT NULL DEFAULT 'AG_BACKPLATE',
    "widthMm" DECIMAL(10,2) NOT NULL,
    "heightMm" DECIMAL(10,2) NOT NULL,
    "layout" JSONB NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_drawing_panel_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_drawings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "templateId" TEXT,
    "panelGroupLabel" TEXT,
    "name" TEXT NOT NULL,
    "status" "DrawingStatus" NOT NULL DEFAULT 'DRAFT',
    "model" JSONB NOT NULL,
    "exportedAt" TIMESTAMP(3),
    "exportFileKey" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_drawings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_product_drawing_specs_productId_key" ON "crm_product_drawing_specs"("productId");

-- CreateIndex
CREATE INDEX "crm_drawing_library_components_tenantId_idx" ON "crm_drawing_library_components"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_drawing_library_components_tenantId_key_key" ON "crm_drawing_library_components"("tenantId", "key");

-- CreateIndex
CREATE INDEX "crm_drawing_panel_templates_tenantId_idx" ON "crm_drawing_panel_templates"("tenantId");

-- CreateIndex
CREATE INDEX "crm_drawings_tenantId_quoteId_idx" ON "crm_drawings"("tenantId", "quoteId");

-- CreateIndex
CREATE INDEX "crm_drawings_tenantId_deletedAt_idx" ON "crm_drawings"("tenantId", "deletedAt");

-- AddForeignKey
ALTER TABLE "crm_product_drawing_specs" ADD CONSTRAINT "crm_product_drawing_specs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "crm_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_drawing_library_components" ADD CONSTRAINT "crm_drawing_library_components_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_drawing_panel_templates" ADD CONSTRAINT "crm_drawing_panel_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_drawings" ADD CONSTRAINT "crm_drawings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_drawings" ADD CONSTRAINT "crm_drawings_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_drawings" ADD CONSTRAINT "crm_drawings_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "crm_drawing_panel_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
