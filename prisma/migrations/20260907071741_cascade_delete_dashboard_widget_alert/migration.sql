-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_widgetId_fkey";

-- DropForeignKey
ALTER TABLE "scheduled_reports" DROP CONSTRAINT "scheduled_reports_dashboardId_fkey";

-- DropForeignKey
ALTER TABLE "widgets" DROP CONSTRAINT "widgets_dashboardId_fkey";

-- AddForeignKey
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "widgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
