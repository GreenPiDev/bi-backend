import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MailService } from '../core/mail/mail.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { DashboardPdfService } from '../modules/exports/dashboard-pdf.service';
import { TokenService } from '../modules/auth/token.service';
import {
  REPORTS_QUEUE,
  type SendReportJobPayload,
} from './reports-queue.constants';

@Processor(REPORTS_QUEUE)
export class SendScheduledReportProcessor extends WorkerHost {
  private readonly logger = new Logger(SendScheduledReportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly dashboardPdf: DashboardPdfService,
    private readonly mail: MailService,
  ) {
    super();
  }

  async process(job: Job<SendReportJobPayload>): Promise<void> {
    const report = await this.prisma.scheduledReport.findUnique({
      where: { id: job.data.reportId },
      include: { dashboard: true },
    });
    if (!report || !report.isActive) {
      return;
    }

    /** Zamanlanmis rapor belirli bir kullaniciya bagli degil (ScheduledReport modelinde
     * createdById yok); panoyu yaratan kullanicinin kimligiyle render ediliyor - CLAUDE.md
     * bunu belirtmiyor, en yakin dogal sahiplik iliskisi bu (bkz. docs/VARSAYIMLAR.md). */
    const renderer = await this.prisma.user.findUnique({
      where: { id: report.dashboard.createdById },
    });
    if (!renderer) {
      this.logger.warn(
        `Rapor ${report.id} icin pano sahibi bulunamadi, atlaniyor.`,
      );
      return;
    }

    const accessToken = this.tokenService.signAccessToken({
      sub: renderer.id,
      tenantId: renderer.tenantId,
      role: renderer.role,
      isPlatformAdmin: renderer.isPlatformAdmin,
    });
    const pdf = await this.dashboardPdf.render(report.dashboardId, accessToken);

    await this.mail.send({
      to: report.recipients,
      subject: `Pusula BI - ${report.dashboard.name} raporu`,
      text: `${report.dashboard.name} panosunun zamanlanmis raporu ektedir.`,
      attachments: [
        {
          filename: `${report.dashboard.name}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });

    await this.prisma.scheduledReport.update({
      where: { id: report.id },
      data: { lastRunAt: new Date() },
    });
  }
}
