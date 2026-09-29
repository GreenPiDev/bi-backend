import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type ReminderTypeOption } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  CreateReminderTypeOptionDto,
  UpdateReminderTypeOptionDto,
} from './dto/reminder-type-option.dto';

@Injectable()
export class ReminderTypeOptionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  list(): Promise<ReminderTypeOption[]> {
    return this.prisma.reminderTypeOption.findMany({
      orderBy: { label: 'asc' },
    });
  }

  private async emitUpdated(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const options = await this.list();
    this.realtime.emitToTenant(
      tenantId,
      'reminderTypeOptions.updated',
      options,
    );
  }

  async create(dto: CreateReminderTypeOptionDto): Promise<ReminderTypeOption> {
    // Postgres'in varsayilan "C" locale'i Turkce aksanli harflerde (Ü, Ö, Ş, Ç, İ/ı)
    // case-insensitive karsilastirmayi (ILIKE) yanlis sonuclandiriyor - bu yuzden tum
    // etiketler DB'ye hep buyuk harfle yazilir (bkz. InteractionTypeOptionsService).
    const label = dto.label.toLocaleUpperCase('tr-TR');
    try {
      const option = await this.prisma.reminderTypeOption.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { label } as never,
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'ReminderTypeOption',
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
          'REMINDER_TYPE_ALREADY_EXISTS',
          'Bu hatirlatici turu zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateReminderTypeOptionDto,
  ): Promise<ReminderTypeOption> {
    const existing = await this.prisma.reminderTypeOption.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        'NOT_FOUND',
        'Hatirlatici turu bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const option = await this.prisma.reminderTypeOption.update({
        where: { id },
        data: { label: dto.label.toLocaleUpperCase('tr-TR') },
      });
      await this.audit.log({
        action: 'UPDATE',
        entity: 'ReminderTypeOption',
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
          'REMINDER_TYPE_ALREADY_EXISTS',
          'Bu hatirlatici turu zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const option = await this.prisma.reminderTypeOption.findFirst({
      where: { id },
    });
    if (!option) {
      throw new AppException(
        'NOT_FOUND',
        'Hatirlatici turu bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.reminderTypeOption.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'ReminderTypeOption',
      entityId: id,
    });
    await this.emitUpdated();
  }
}
