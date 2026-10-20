-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'PARTIALLY_RECEIVED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'FULLY_RECEIVED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "crm_purchase_order_items" ADD COLUMN     "isCancelled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receivedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0;
