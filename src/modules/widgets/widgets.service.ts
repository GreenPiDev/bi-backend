import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Widget } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import { DashboardsService } from '../dashboards/dashboards.service';
import type { CreateWidgetDto, UpdateWidgetDto } from './dto/widget.dto';

@Injectable()
export class WidgetsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly dashboards: DashboardsService,
    private readonly audit: AuditService,
  ) {}

  async list(dashboardId: string): Promise<Widget[]> {
    await this.dashboards.requireDashboard(dashboardId);
    return this.prisma.widget.findMany({
      where: { dashboardId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dashboardId: string, dto: CreateWidgetDto): Promise<Widget> {
    await this.dashboards.requireDashboard(dashboardId);
    const widget = await this.prisma.widget.create({
      data: {
        dashboardId,
        type: dto.type,
        title: dto.title,
        querySpec: dto.querySpec,
        vizOptions: dto.vizOptions,
        position: dto.position,
      },
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'Widget',
      entityId: widget.id,
      meta: { dashboardId, title: widget.title },
    });
    return widget;
  }

  async update(
    dashboardId: string,
    widgetId: string,
    dto: UpdateWidgetDto,
  ): Promise<Widget> {
    await this.requireWidget(dashboardId, widgetId);
    const widget = await this.prisma.widget.update({
      where: { id: widgetId },
      data: {
        type: dto.type,
        title: dto.title,
        querySpec: dto.querySpec,
        vizOptions: dto.vizOptions,
        position: dto.position,
      },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'Widget',
      entityId: widgetId,
      meta: { dashboardId },
    });
    return widget;
  }

  async remove(dashboardId: string, widgetId: string): Promise<void> {
    await this.requireWidget(dashboardId, widgetId);
    await this.prisma.widget.delete({ where: { id: widgetId } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'Widget',
      entityId: widgetId,
      meta: { dashboardId },
    });
  }

  private async requireWidget(
    dashboardId: string,
    widgetId: string,
  ): Promise<Widget> {
    await this.dashboards.requireDashboard(dashboardId);
    const widget = await this.prisma.widget.findFirst({
      where: { id: widgetId, dashboardId },
    });
    if (!widget) {
      throw new AppException(
        'NOT_FOUND',
        'Widget bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return widget;
  }
}
