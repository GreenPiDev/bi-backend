-- CreateEnum
CREATE TYPE "CalendarAttendeeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CALENDAR_EVENT_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'CALENDAR_EVENT_RESPONSE';
ALTER TYPE "NotificationType" ADD VALUE 'CALENDAR_EVENT_UPDATED';

-- AlterTable
ALTER TABLE "crm_calendar_event_attendees" ADD COLUMN     "declineNote" TEXT,
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "status" "CalendarAttendeeStatus" NOT NULL DEFAULT 'PENDING';

-- Backfill: bu migration'dan once olusan tum katilimci satirlari, eski "otomatik
-- ekleme" davranisiyla zaten fiilen kabul edilmis sayilir - aksi halde mevcut
-- kullanicilar deploy aninda kendi takvimlerinden etkinliklerin kaybolduğunu gorur.
-- Sadece bu satirdan SONRA olusturulan yeni attendee'ler PENDING varsayilanindan gecer.
UPDATE "crm_calendar_event_attendees" SET "status" = 'ACCEPTED', "respondedAt" = "createdAt";
