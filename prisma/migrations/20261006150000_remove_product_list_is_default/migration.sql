-- Kullanici talebiyle "Varsayilan urun listesi" ozelligi komple kaldirildi
-- (bkz. CLAUDE.md, docs/VARSAYIMLAR.md) - sadece tekillik garantisi ve bir UI
-- rozeti disinda fonksiyonel bir etkisi yoktu.
ALTER TABLE "crm_product_lists" DROP COLUMN "isDefault";
