-- Faz B (bkz. docs/VARSAYIMLAR.md V40): marka'ya ozgu, bilinen bir Product alanina
-- eslenmeyen ice aktarma kolonlari icin catch-all.
ALTER TABLE "crm_products" ADD COLUMN     "attributes" JSONB;
