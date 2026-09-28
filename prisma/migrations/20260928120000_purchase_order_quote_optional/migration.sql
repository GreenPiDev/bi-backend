-- Ad-hoc (2026-09-28): PurchaseOrder.quoteId artik opsiyonel - /siparisler/yeni
-- sayfasindan teklife bagli olmadan da siparis olusturulabilir.
ALTER TABLE "crm_purchase_orders" ALTER COLUMN "quoteId" DROP NOT NULL;
