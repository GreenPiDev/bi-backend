-- Faz 11d tasarim duzeltmesi (bkz. docs/VARSAYIMLAR.md V27): ayri ProductDiscountPolicy
-- tablosu (bir onceki migration'da eklenmisti) gereksiz bulundu - 1:1, tek alanli bir iliski
-- icin ayri tablo/CRUD yerine Product.maxDiscountPct alani yeterli.
-- DropForeignKey
ALTER TABLE "crm_product_discount_policies" DROP CONSTRAINT "crm_product_discount_policies_productId_fkey";

-- DropForeignKey
ALTER TABLE "crm_product_discount_policies" DROP CONSTRAINT "crm_product_discount_policies_tenantId_fkey";

-- AlterTable
ALTER TABLE "crm_products" ADD COLUMN     "maxDiscountPct" DECIMAL(5,2);

-- DropTable
DROP TABLE "crm_product_discount_policies";
