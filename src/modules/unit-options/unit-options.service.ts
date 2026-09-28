import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type UnitOption } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  CreateUnitOptionDto,
  UpdateUnitOptionDto,
} from './dto/unit-option.dto';

@Injectable()
export class UnitOptionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  list(): Promise<UnitOption[]> {
    return this.prisma.unitOption.findMany({ orderBy: { label: 'asc' } });
  }

  private async emitUpdated(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const options = await this.list();
    this.realtime.emitToTenant(tenantId, 'unitOptions.updated', options);
  }

  async create(dto: CreateUnitOptionDto): Promise<UnitOption> {
    try {
      const option = await this.prisma.unitOption.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { label: dto.label } as never,
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'UnitOption',
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
          'UNIT_ALREADY_EXISTS',
          'Bu birim zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUnitOptionDto): Promise<UnitOption> {
    const existing = await this.prisma.unitOption.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        'NOT_FOUND',
        'Birim bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const option = await this.prisma.unitOption.update({
        where: { id },
        data: { label: dto.label },
      });
      await this.audit.log({
        action: 'UPDATE',
        entity: 'UnitOption',
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
          'UNIT_ALREADY_EXISTS',
          'Bu birim zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const option = await this.prisma.unitOption.findFirst({
      where: { id },
    });
    if (!option) {
      throw new AppException(
        'NOT_FOUND',
        'Birim bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.unitOption.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'UnitOption',
      entityId: id,
    });
    await this.emitUpdated();
  }
}
