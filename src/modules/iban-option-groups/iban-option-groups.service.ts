import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { IbanOptionGroup } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { FileUrlService } from '../../core/storage/file-url.service';
import { R2StorageService } from '../../core/storage/r2-storage.service';
import { detectImageExtension } from '../../core/validators/image-upload-validation';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type { IbanOptionGroupDto } from './dto/iban-option-group.dto';

export type IbanOptionGroupResponse = IbanOptionGroup & {
  logoUrl: string | null;
};

@Injectable()
export class IbanOptionGroupsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly storage: R2StorageService,
    private readonly fileUrl: FileUrlService,
  ) {}

  private toResponse(group: IbanOptionGroup): IbanOptionGroupResponse {
    return {
      ...group,
      logoUrl: this.fileUrl.build(group.logoKey, group.updatedAt),
    };
  }

  async list(): Promise<IbanOptionGroupResponse[]> {
    const groups = await this.prisma.ibanOptionGroup.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return groups.map((group) => this.toResponse(group));
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

  private async findByIdOrThrow(id: string): Promise<IbanOptionGroup> {
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
    return group;
  }

  /** QuoteTemplatesService ile ayni "en fazla bir isDefault=true" deseni -
   * yeni grup varsayilan isaretlenirse diger tum gruplar once false'a cekilir. */
  async create(dto: IbanOptionGroupDto): Promise<IbanOptionGroupResponse> {
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
    return this.toResponse(group);
  }

  async update(
    id: string,
    dto: IbanOptionGroupDto,
  ): Promise<IbanOptionGroupResponse> {
    await this.findByIdOrThrow(id);
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
    return this.toResponse(group);
  }

  async remove(id: string): Promise<void> {
    const group = await this.findByIdOrThrow(id);
    if (group.logoKey) {
      await this.storage.delete(group.logoKey);
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

  /** Banka logosu - QuoteTemplatesService.uploadLogo ile ayni desen (bkz. o
   * dosya), tek fark burada tek bir gorsel alani olmasi. */
  async uploadLogo(
    id: string,
    file: { mimetype: string; buffer: Buffer },
  ): Promise<IbanOptionGroupResponse> {
    const { tenantId } = TenantContext.getOrThrow();
    const group = await this.findByIdOrThrow(id);
    const ext = detectImageExtension(file.mimetype, file.buffer);
    const env =
      process.env.NODE_ENV === 'production' ? 'production' : 'development';
    const key = `PILENS/${env}/${tenantId}/iban-option-groups/${id}/logo.${ext}`;

    await this.storage.upload(key, file.buffer, file.mimetype);
    if (group.logoKey && group.logoKey !== key) {
      await this.storage.delete(group.logoKey);
    }
    const updated = await this.prisma.ibanOptionGroup.update({
      where: { id },
      data: { logoKey: key },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'IbanOptionGroup',
      entityId: id,
      meta: { logoUploaded: true },
    });
    await this.emitUpdated();
    return this.toResponse(updated);
  }

  async removeLogo(id: string): Promise<IbanOptionGroupResponse> {
    const group = await this.findByIdOrThrow(id);
    if (group.logoKey) {
      await this.storage.delete(group.logoKey);
    }
    const updated = await this.prisma.ibanOptionGroup.update({
      where: { id },
      data: { logoKey: null },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'IbanOptionGroup',
      entityId: id,
      meta: { logoRemoved: true },
    });
    await this.emitUpdated();
    return this.toResponse(updated);
  }
}
