-- CreateTable
CREATE TABLE "crm_quote_rejection_reason_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_quote_rejection_reason_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_quote_rejection_reason_options_tenantId_label_key" ON "crm_quote_rejection_reason_options"("tenantId", "label");

-- AddForeignKey
ALTER TABLE "crm_quote_rejection_reason_options" ADD CONSTRAINT "crm_quote_rejection_reason_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DataMigration: her mevcut tenant icin 8 built-in red sebebiyle basla (bkz.
-- tenants.service.ts DEFAULT_QUOTE_REJECTION_REASONS - yeni tenant'lar artik
-- createTenantWithAdmin icinde ayni listeyle olusuyor, bu INSERT sadece
-- migration'dan once var olan tenant'lari yakalamak icin).
INSERT INTO "crm_quote_rejection_reason_options" ("id", "tenantId", "label", "createdAt")
SELECT gen_random_uuid(), t."id", reason."label", CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN (
  VALUES
    ('Yüksek Fiyat'),
    ('Daha Düşük Başka Teklif'),
    ('Bütçe Yetersiz'),
    ('Proje İptal Edildi'),
    ('Proje Ertelendi'),
    ('Ürün/Hizmet Uygun Bulunmadı'),
    ('Ödeme Koşulları Uygun Değil'),
    ('Başka Tedarikçi Tercih Edildi')
) AS reason("label");
