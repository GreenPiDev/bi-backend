-- DataMigration: Postgres'in varsayilan locale'i (bkz. "C" locale sorunu, docs/VARSAYIMLAR.md)
-- Turkce aksanli harflerde (Ü, Ö, Ş, Ç, İ/ı) case-insensitive karsilastirmayi (ILIKE)
-- yanlis sonuclandiriyor. Bu yuzden InteractionTypeOptionsService artik tum etiketleri
-- hep buyuk harfle (JS toLocaleUpperCase('tr-TR')) yaziyor - bu migration, seed
-- migration'inin (20260927125908_interaction_type_options) olusturdugu 5 varsayilan
-- etiketi ayni Turkce-buyuk-harf kurallarina gore normalize eder. Postgres'in kendi
-- UPPER() fonksiyonu da Turkce ı/İ'yi yanlis cevirdiginden (orn. "TOPLANTı") burada
-- degerler elle (JS ile hesaplanmis dogru karsiliklariyla) yazilir.
UPDATE "crm_interaction_type_options" SET "label" = 'TELEFON'  WHERE "label" = 'Telefon';
UPDATE "crm_interaction_type_options" SET "label" = 'ZİYARET'  WHERE "label" = 'Ziyaret';
UPDATE "crm_interaction_type_options" SET "label" = 'TOPLANTI' WHERE "label" = 'Toplantı';
UPDATE "crm_interaction_type_options" SET "label" = 'E-POSTA'  WHERE "label" = 'E-posta';
UPDATE "crm_interaction_type_options" SET "label" = 'DİĞER'    WHERE "label" = 'Diğer';

UPDATE "crm_interactions" SET "type" = 'TELEFON'  WHERE "type" = 'Telefon';
UPDATE "crm_interactions" SET "type" = 'ZİYARET'  WHERE "type" = 'Ziyaret';
UPDATE "crm_interactions" SET "type" = 'TOPLANTI' WHERE "type" = 'Toplantı';
UPDATE "crm_interactions" SET "type" = 'E-POSTA'  WHERE "type" = 'E-posta';
UPDATE "crm_interactions" SET "type" = 'DİĞER'    WHERE "type" = 'Diğer';
