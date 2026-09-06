-- CreateTable
CREATE TABLE "crm_calendar_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_calendar_event_attendees" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_calendar_event_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_calendar_events_tenantId_startAt_idx" ON "crm_calendar_events"("tenantId", "startAt");

-- CreateIndex
CREATE INDEX "crm_calendar_events_tenantId_deletedAt_idx" ON "crm_calendar_events"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_calendar_event_attendees_eventId_userId_key" ON "crm_calendar_event_attendees"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "crm_calendar_events" ADD CONSTRAINT "crm_calendar_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_calendar_event_attendees" ADD CONSTRAINT "crm_calendar_event_attendees_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "crm_calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SeedData: Ajanda/Takvim sayfasi crm modulune bagli - bkz. docs/VARSAYIMLAR.md V23,
-- accounts/contacts icin ayni desen (migration 20260905193505).
INSERT INTO "page_module_assignments" ("pageKey", "moduleKey", "updatedAt") VALUES
    ('calendar', 'crm', CURRENT_TIMESTAMP);
