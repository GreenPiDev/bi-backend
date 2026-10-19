-- AlterTable
ALTER TABLE "crm_quote_items" ADD COLUMN     "deliveredQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "crm_sales_order_items" ADD COLUMN     "deliveredQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0;
