-- Shared (not per-user) column widths per sheet, { "<col>": px }.
ALTER TABLE "spreadsheet_sheets" ADD COLUMN "colWidths" JSONB;
