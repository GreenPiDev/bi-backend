-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_INACTIVITY_ALERT';

-- CreateTable
CREATE TABLE "crm_interaction_type_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_interaction_type_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_interaction_type_options_tenantId_label_key" ON "crm_interaction_type_options"("tenantId", "label");

-- AddForeignKey
ALTER TABLE "crm_interaction_type_options" ADD CONSTRAINT "crm_interaction_type_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DataMigration: her tenant icin eskiden sabit olan 5 InteractionType degerini Turkce
-- etiket olarak tanimla (bkz. docs/VARSAYIMLAR.md - Gorusme Sekli dinamik listeye tasima).
-- Boylece mevcut tenantlarin gorusme ekleme formu bu migration'dan sonra bos gorunmez,
-- eskiden oldugu gibi ayni 5 secenekle devam eder.
INSERT INTO "crm_interaction_type_options" ("id", "tenantId", "label", "createdAt")
SELECT gen_random_uuid(), t."id", v.label, CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN (VALUES ('Telefon'), ('Ziyaret'), ('Toplantı'), ('E-posta'), ('Diğer')) AS v(label);

-- AlterTable: enum kodlarini (CALL/VISIT/...) ayni Turkce etiketlere cevirerek metne donustur -
-- boylece mevcut Interaction kayitlari yukaridaki yeni tanimlanan seceneklerden biriyle eslesir.
ALTER TABLE "crm_interactions" ALTER COLUMN "type" TYPE TEXT USING (
  CASE "type"::text
    WHEN 'CALL' THEN 'Telefon'
    WHEN 'VISIT' THEN 'Ziyaret'
    WHEN 'MEETING' THEN 'Toplantı'
    WHEN 'EMAIL' THEN 'E-posta'
    WHEN 'OTHER' THEN 'Diğer'
    ELSE "type"::text
  END
);

-- DropEnum
DROP TYPE "InteractionType";
