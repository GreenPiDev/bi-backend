import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type InteractionTypeOption } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  CreateInteractionTypeOptionDto,
  UpdateInteractionTypeOptionDto,
} from './dto/interaction-type-option.dto';

@Injectable()
export class InteractionTypeOptionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  list(): Promise<InteractionTypeOption[]> {
    return this.prisma.interactionTypeOption.findMany({
      orderBy: { label: 'asc' },
    });
  }

  private async emitUpdated(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const options = await this.list();
    this.realtime.emitToTenant(
      tenantId,
      'interactionTypeOptions.updated',
      options,
    );
  }

  async create(
    dto: CreateInteractionTypeOptionDto,
  ): Promise<InteractionTypeOption> {
    // Postgres'in varsayilan "C" locale'i Turkce aksanli harflerde (Ü, Ö, Ş, Ç, İ/ı)
    // case-insensitive karsilastirmayi (ILIKE) yanlis sonuclandiriyor (bkz.
    // docs/VARSAYIMLAR.md) - bu yuzden tum etiketler DB'ye hep buyuk harfle yazilir,
    // eslesme JS'teki toLocaleUpperCase('tr-TR') ile normalize edilmis tam esitlik
    // uzerinden yapilir (bkz. InteractionImportsService.resolveInteractionTypeLabel).
    const label = dto.label.toLocaleUpperCase('tr-TR');
    try {
      const option = await this.prisma.interactionTypeOption.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { label } as never,
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'InteractionTypeOption',
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
          'INTERACTION_TYPE_ALREADY_EXISTS',
          'Bu gorusme sekli zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateInteractionTypeOptionDto,
  ): Promise<InteractionTypeOption> {
    const existing = await this.prisma.interactionTypeOption.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        'NOT_FOUND',
        'Gorusme sekli bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const option = await this.prisma.interactionTypeOption.update({
        where: { id },
        data: { label: dto.label.toLocaleUpperCase('tr-TR') },
      });
      await this.audit.log({
        action: 'UPDATE',
        entity: 'InteractionTypeOption',
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
          'INTERACTION_TYPE_ALREADY_EXISTS',
          'Bu gorusme sekli zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const option = await this.prisma.interactionTypeOption.findFirst({
      where: { id },
    });
    if (!option) {
      throw new AppException(
        'NOT_FOUND',
        'Gorusme sekli bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.interactionTypeOption.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'InteractionTypeOption',
      entityId: id,
    });
    await this.emitUpdated();
  }
}
