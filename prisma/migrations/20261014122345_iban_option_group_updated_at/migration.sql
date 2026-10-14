/*
  Warnings:

  - Added the required column `updatedAt` to the `crm_iban_option_groups` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "crm_iban_option_groups" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
