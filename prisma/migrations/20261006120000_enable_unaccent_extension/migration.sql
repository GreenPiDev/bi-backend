-- Postgres bu projede LC_CTYPE=C ile kurulu, bu yuzden lower()/ILIKE Turkce aksanli
-- karakterleri (Ü, Ö, Ş, Ç, Ğ, İ, ı) casefold edemiyor (örn. lower('MÜHENDİSLİK') ->
-- 'mÜhendİslİk'), bu da case-insensitive arama/filtrelemeyi bozuyor. unaccent()
-- aksanlari ASCII'ye indirip (Ü->U, İ->I) sorunu cozuyor - bkz. docs/VARSAYIMLAR.md.
CREATE EXTENSION IF NOT EXISTS unaccent;
