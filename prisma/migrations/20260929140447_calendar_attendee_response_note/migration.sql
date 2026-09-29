-- Rename (not drop+recreate) to preserve existing decline notes.
ALTER TABLE "crm_calendar_event_attendees" RENAME COLUMN "declineNote" TO "responseNote";
