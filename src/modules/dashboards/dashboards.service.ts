import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Dashboard, Widget } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  UpdateDashboardDto,
  CreateDashboardDto,
} from './dto/dashboard.dto';

export type DashboardWithWidgets = Dashboard & { widgets: Widget[] };

@Injectable()
export class DashboardsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<Dashboard[]> {
    return this.prisma.dashboard.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getById(id: string): Promise<DashboardWithWidgets> {
    return this.requireDashboard(id);
  }

  async create(
    tenantId: string,
    createdById: string,
    dto: CreateDashboardDto,
  ): Promise<Dashboard> {
    const dashboard = await this.prisma.dashboard.create({
      data: {
        tenantId,
        createdById,
        name: dto.name,
        description: dto.description,
      },
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'Dashboard',
      entityId: dashboard.id,
      meta: { name: dashboard.name },
    });
    return dashboard;
  }

  async update(
    id: string,
    dto: UpdateDashboardDto,
  ): Promise<DashboardWithWidgets> {
    await this.requireDashboard(id);
    await this.prisma.dashboard.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        layout: dto.layout,
        filters: dto.filters,
      },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'Dashboard',
      entityId: id,
    });
    return this.requireDashboard(id);
  }

  async remove(id: string): Promise<void> {
    await this.requireDashboard(id);
    await this.prisma.dashboard.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'Dashboard',
      entityId: id,
    });
  }

  async requireDashboard(id: string): Promise<DashboardWithWidgets> {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id },
      include: { widgets: true },
    });
    if (!dashboard) {
      throw new AppException(
        'NOT_FOUND',
        'Pano bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return dashboard;
  }
}
