import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type SectorOption } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type { CreateSectorOptionDto } from './dto/sector-option.dto';

@Injectable()
export class SectorOptionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<SectorOption[]> {
    return this.prisma.sectorOption.findMany({ orderBy: { label: 'asc' } });
  }

  async create(dto: CreateSectorOptionDto): Promise<SectorOption> {
    try {
      const option = await this.prisma.sectorOption.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { label: dto.label } as never,
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'SectorOption',
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
          'SECTOR_ALREADY_EXISTS',
          'Bu sektor zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const option = await this.prisma.sectorOption.findFirst({
      where: { id },
    });
    if (!option) {
      throw new AppException(
        'NOT_FOUND',
        'Sektor bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.sectorOption.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'SectorOption',
      entityId: id,
    });
  }
}
