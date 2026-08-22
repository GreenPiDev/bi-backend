import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Alert } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import { WidgetsService } from '../widgets/widgets.service';
import type { CreateAlertDto, UpdateAlertDto } from './dto/alert.dto';

@Injectable()
export class AlertsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly widgets: WidgetsService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<Alert[]> {
    return this.prisma.alert.findMany();
  }

  async create(tenantId: string, dto: CreateAlertDto): Promise<Alert> {
    await this.widgets.findByIdAcrossDashboards(dto.widgetId);
    const alert = await this.prisma.alert.create({
      data: {
        tenantId,
        widgetId: dto.widgetId,
        operator: dto.operator,
        threshold: dto.threshold,
        recipients: dto.recipients,
      },
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'Alert',
      entityId: alert.id,
      meta: {
        widgetId: alert.widgetId,
        operator: alert.operator,
        threshold: alert.threshold,
      },
    });
    return alert;
  }

  async update(id: string, dto: UpdateAlertDto): Promise<Alert> {
    await this.requireAlert(id);
    const alert = await this.prisma.alert.update({
      where: { id },
      data: {
        operator: dto.operator,
        threshold: dto.threshold,
        recipients: dto.recipients,
      },
    });
    await this.audit.log({ action: 'UPDATE', entity: 'Alert', entityId: id });
    return alert;
  }

  async remove(id: string): Promise<void> {
    await this.requireAlert(id);
    await this.prisma.alert.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'Alert', entityId: id });
  }

  private async requireAlert(id: string): Promise<Alert> {
    const alert = await this.prisma.alert.findFirst({ where: { id } });
    if (!alert) {
      throw new AppException(
        'NOT_FOUND',
        'Alarm bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return alert;
  }
}
