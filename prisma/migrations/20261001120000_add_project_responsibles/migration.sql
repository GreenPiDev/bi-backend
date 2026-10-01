-- "Bizden ilgili" (dahili sorumlu kullanicilar) - proje basina coklu secim,
-- CalendarEventAttendee ile ayni desen (gercek User FK'si yok).

-- CreateTable
CREATE TABLE "crm_project_responsibles" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_project_responsibles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_project_responsibles_projectId_userId_key" ON "crm_project_responsibles"("projectId", "userId");

-- CreateIndex
CREATE INDEX "crm_project_responsibles_userId_idx" ON "crm_project_responsibles"("userId");

-- AddForeignKey
ALTER TABLE "crm_project_responsibles" ADD CONSTRAINT "crm_project_responsibles_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "crm_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
