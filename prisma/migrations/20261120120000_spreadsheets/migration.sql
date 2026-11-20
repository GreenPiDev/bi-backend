-- CreateTable
CREATE TABLE "spreadsheets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "spreadsheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spreadsheet_sheets" (
    "id" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "colCount" INTEGER NOT NULL,

    CONSTRAINT "spreadsheet_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spreadsheet_cells" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "value" TEXT,
    "bgColor" TEXT,
    "fontColor" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spreadsheet_cells_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spreadsheets_tenantId_deletedAt_idx" ON "spreadsheets"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "spreadsheet_sheets_spreadsheetId_idx" ON "spreadsheet_sheets"("spreadsheetId");

-- CreateIndex
CREATE UNIQUE INDEX "spreadsheet_cells_sheetId_row_col_key" ON "spreadsheet_cells"("sheetId", "row", "col");

-- AddForeignKey
ALTER TABLE "spreadsheets" ADD CONSTRAINT "spreadsheets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spreadsheet_sheets" ADD CONSTRAINT "spreadsheet_sheets_spreadsheetId_fkey" FOREIGN KEY ("spreadsheetId") REFERENCES "spreadsheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spreadsheet_cells" ADD CONSTRAINT "spreadsheet_cells_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "spreadsheet_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SeedData: "E-Tablolar" (spreadsheets) sayfasi, Veri Kumeleri ile ayni sekmeli
-- /datasets sayfasinda durdugu icin analytics modulune bagli (bkz. VARSAYIMLAR V88).
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('spreadsheets', 'analytics', CURRENT_TIMESTAMP);
