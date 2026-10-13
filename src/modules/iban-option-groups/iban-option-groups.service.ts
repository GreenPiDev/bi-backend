import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { IbanOptionGroup } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type { IbanOptionGroupDto } from './dto/iban-option-group.dto';

@Injectable()
export class IbanOptionGroupsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  list(): Promise<IbanOptionGroup[]> {
    return this.prisma.ibanOptionGroup.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Grup adi IbanOption dropdown'unda da gorundugu icin, grup degisikliklerinde
   * hem bu listeyi hem de iban-options tarafindaki dropdown'u (grup adi
   * degismis olabilir) tazelemesi icin frontend'e tek bir event yeterli -
   * `useIbanOptionGroupsRealtimeSync` ikisini de invalidate eder. */
  private async emitUpdated(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const groups = await this.list();
    this.realtime.emitToTenant(tenantId, 'ibanOptionGroups.updated', groups);
  }

  /** QuoteTemplatesService ile ayni "en fazla bir isDefault=true" deseni -
   * yeni grup varsayilan isaretlenirse diger tum gruplar once false'a cekilir. */
  async create(dto: IbanOptionGroupDto): Promise<IbanOptionGroup> {
    const isDefault = dto.isDefault ?? false;
    const group = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.ibanOptionGroup.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.ibanOptionGroup.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { name: dto.name, isDefault } as never,
      });
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'IbanOptionGroup',
      entityId: group.id,
      meta: { name: group.name },
    });
    await this.emitUpdated();
    return group;
  }

  async update(id: string, dto: IbanOptionGroupDto): Promise<IbanOptionGroup> {
    const existing = await this.prisma.ibanOptionGroup.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        'NOT_FOUND',
        'Hesap grubu bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const group = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.ibanOptionGroup.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.ibanOptionGroup.update({
        where: { id },
        data: { name: dto.name, isDefault: dto.isDefault ?? false },
      });
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'IbanOptionGroup',
      entityId: group.id,
      meta: { name: group.name },
    });
    await this.emitUpdated();
    return group;
  }

  async remove(id: string): Promise<void> {
    const group = await this.prisma.ibanOptionGroup.findFirst({
      where: { id },
    });
    if (!group) {
      throw new AppException(
        'NOT_FOUND',
        'Hesap grubu bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    // Gruba bagli IbanOption'lar silinmez, sadece groupId'leri null'a doner
    // (schema'da onDelete: SetNull, bkz. IbanOptionGroup doc comment'i).
    await this.prisma.ibanOptionGroup.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'IbanOptionGroup',
      entityId: id,
    });
    await this.emitUpdated();
  }
}
