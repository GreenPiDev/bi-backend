import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type TitleOption } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  CreateTitleOptionDto,
  UpdateTitleOptionDto,
} from './dto/title-option.dto';

@Injectable()
export class TitleOptionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  list(): Promise<TitleOption[]> {
    return this.prisma.titleOption.findMany({ orderBy: { label: 'asc' } });
  }

  private async emitUpdated(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const options = await this.list();
    this.realtime.emitToTenant(tenantId, 'titleOptions.updated', options);
  }

  async create(dto: CreateTitleOptionDto): Promise<TitleOption> {
    try {
      const option = await this.prisma.titleOption.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { label: dto.label } as never,
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'TitleOption',
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
          'TITLE_ALREADY_EXISTS',
          'Bu unvan zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateTitleOptionDto): Promise<TitleOption> {
    const existing = await this.prisma.titleOption.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        'NOT_FOUND',
        'Unvan bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const option = await this.prisma.titleOption.update({
        where: { id },
        data: { label: dto.label },
      });
      await this.audit.log({
        action: 'UPDATE',
        entity: 'TitleOption',
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
          'TITLE_ALREADY_EXISTS',
          'Bu unvan zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const option = await this.prisma.titleOption.findFirst({
      where: { id },
    });
    if (!option) {
      throw new AppException(
        'NOT_FOUND',
        'Unvan bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.titleOption.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'TitleOption',
      entityId: id,
    });
    await this.emitUpdated();
  }
}
