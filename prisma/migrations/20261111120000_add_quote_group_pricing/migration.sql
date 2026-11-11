-- Manual per-group pricing for grouped quotes ("Gruba fiyat atamasi yap").
ALTER TABLE "crm_quotes" ADD COLUMN "groupPricingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "crm_quotes" ADD COLUMN "groupPrices" JSONB;
