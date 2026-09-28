import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type BrandOption } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  CreateBrandOptionDto,
  UpdateBrandOptionDto,
} from './dto/brand-option.dto';

@Injectable()
export class BrandOptionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  list(): Promise<BrandOption[]> {
    return this.prisma.brandOption.findMany({ orderBy: { label: 'asc' } });
  }

  private async emitUpdated(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const options = await this.list();
    this.realtime.emitToTenant(tenantId, 'brandOptions.updated', options);
  }

  async create(dto: CreateBrandOptionDto): Promise<BrandOption> {
    try {
      const option = await this.prisma.brandOption.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { label: dto.label } as never,
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'BrandOption',
        entityId: option.id,
        meta: { label: option.label },
      });
      await this.emitUpdated();
      return option;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'BRAND_ALREADY_EXISTS',
          'Bu marka zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateBrandOptionDto): Promise<BrandOption> {
    const existing = await this.prisma.brandOption.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        'NOT_FOUND',
        'Marka bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const option = await this.prisma.brandOption.update({
        where: { id },
        data: { label: dto.label },
      });
      await this.audit.log({
        action: 'UPDATE',
        entity: 'BrandOption',
        entityId: option.id,
        meta: { label: option.label },
      });
      await this.emitUpdated();
      return option;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'BRAND_ALREADY_EXISTS',
          'Bu marka zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const option = await this.prisma.brandOption.findFirst({
      where: { id },
    });
    if (!option) {
      throw new AppException(
        'NOT_FOUND',
        'Marka bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.brandOption.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'BrandOption',
      entityId: id,
    });
    await this.emitUpdated();
  }
}
