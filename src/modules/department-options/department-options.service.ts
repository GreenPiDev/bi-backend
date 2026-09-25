import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type DepartmentOption } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  CreateDepartmentOptionDto,
  UpdateDepartmentOptionDto,
} from './dto/department-option.dto';

@Injectable()
export class DepartmentOptionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  list(): Promise<DepartmentOption[]> {
    return this.prisma.departmentOption.findMany({ orderBy: { label: 'asc' } });
  }

  private async emitUpdated(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const options = await this.list();
    this.realtime.emitToTenant(tenantId, 'departmentOptions.updated', options);
  }

  async create(dto: CreateDepartmentOptionDto): Promise<DepartmentOption> {
    try {
      const option = await this.prisma.departmentOption.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { label: dto.label } as never,
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'DepartmentOption',
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
          'DEPARTMENT_ALREADY_EXISTS',
          'Bu departman zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateDepartmentOptionDto,
  ): Promise<DepartmentOption> {
    const existing = await this.prisma.departmentOption.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        'NOT_FOUND',
        'Departman bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const option = await this.prisma.departmentOption.update({
        where: { id },
        data: { label: dto.label },
      });
      await this.audit.log({
        action: 'UPDATE',
        entity: 'DepartmentOption',
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
          'DEPARTMENT_ALREADY_EXISTS',
          'Bu departman zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const option = await this.prisma.departmentOption.findFirst({
      where: { id },
    });
    if (!option) {
      throw new AppException(
        'NOT_FOUND',
        'Departman bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.departmentOption.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'DepartmentOption',
      entityId: id,
    });
    await this.emitUpdated();
  }
}
