import { InjectQueue } from '@nestjs/bullmq';
import {
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import type { ScheduledReport } from '@prisma/client';
import type { Queue } from 'bullmq';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  REPORTS_QUEUE,
  SEND_REPORT_JOB,
  type SendReportJobPayload,
} from '../../jobs/reports-queue.constants';
import { AuditService } from '../audit/audit.service';
import { DashboardsService } from '../dashboards/dashboards.service';
import type {
  CreateScheduledReportDto,
  UpdateScheduledReportDto,
} from './dto/report.dto';

@Injectable()
export class ReportsService implements OnModuleInit {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly rawPrisma: PrismaService,
    private readonly dashboards: DashboardsService,
    @InjectQueue(REPORTS_QUEUE)
    private readonly queue: Queue<SendReportJobPayload>,
    private readonly audit: AuditService,
  ) {}

  /** Redis tamamen sifirlanmis olsa bile (ornegin yeni bir ortamda) aktif raporlarin
   * zamanlayicilarini DB'deki gercek durumla yeniden esitler. */
  async onModuleInit(): Promise<void> {
    const activeReports = await this.rawPrisma.scheduledReport.findMany({
      where: { isActive: true },
    });
    for (const report of activeReports) {
      await this.upsertScheduler(report);
    }
  }

  async list(): Promise<ScheduledReport[]> {
    return this.prisma.scheduledReport.findMany();
  }

  async create(
    tenantId: string,
    dto: CreateScheduledReportDto,
  ): Promise<ScheduledReport> {
    await this.dashboards.requireDashboard(dto.dashboardId);
    const report = await this.prisma.scheduledReport.create({
      data: {
        tenantId,
        dashboardId: dto.dashboardId,
        cron: dto.cron,
        recipients: dto.recipients,
        isActive: dto.isActive,
      },
    });
    if (report.isActive) {
      await this.upsertScheduler(report);
    }
    await this.audit.log({
      action: 'CREATE',
      entity: 'ScheduledReport',
      entityId: report.id,
      meta: { dashboardId: report.dashboardId, cron: report.cron },
    });
    return report;
  }

  async update(
    id: string,
    dto: UpdateScheduledReportDto,
  ): Promise<ScheduledReport> {
    await this.requireReport(id);
    const report = await this.prisma.scheduledReport.update({
      where: { id },
      data: {
        cron: dto.cron,
        recipients: dto.recipients,
        isActive: dto.isActive,
      },
    });
    if (report.isActive) {
      await this.upsertScheduler(report);
    } else {
      await this.queue.removeJobScheduler(report.id);
    }
    await this.audit.log({
      action: 'UPDATE',
      entity: 'ScheduledReport',
      entityId: id,
    });
    return report;
  }

  async remove(id: string): Promise<void> {
    await this.requireReport(id);
    await this.prisma.scheduledReport.delete({ where: { id } });
    await this.queue.removeJobScheduler(id);
    await this.audit.log({
      action: 'DELETE',
      entity: 'ScheduledReport',
      entityId: id,
    });
  }

  private async upsertScheduler(report: ScheduledReport): Promise<void> {
    await this.queue.upsertJobScheduler(
      report.id,
      { pattern: report.cron },
      { name: SEND_REPORT_JOB, data: { reportId: report.id } },
    );
  }

  private async requireReport(id: string): Promise<ScheduledReport> {
    const report = await this.prisma.scheduledReport.findFirst({
      where: { id },
    });
    if (!report) {
      throw new AppException(
        'NOT_FOUND',
        'Zamanlanmis rapor bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return report;
  }
}
