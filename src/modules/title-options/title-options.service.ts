import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type TitleOption } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type { CreateTitleOptionDto } from './dto/title-option.dto';

@Injectable()
export class TitleOptionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<TitleOption[]> {
    return this.prisma.titleOption.findMany({ orderBy: { label: 'asc' } });
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
  }
}
