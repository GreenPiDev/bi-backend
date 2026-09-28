-- DropForeignKey
ALTER TABLE "crm_purchase_orders" DROP CONSTRAINT "crm_purchase_orders_quoteId_fkey";

-- AddForeignKey
ALTER TABLE "crm_purchase_orders" ADD CONSTRAINT "crm_purchase_orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
