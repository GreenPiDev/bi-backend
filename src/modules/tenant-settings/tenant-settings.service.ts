import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type { TenantSettingResponse } from './dto/tenant-setting.dto';
import {
  isKnownSettingKey,
  KNOWN_TENANT_SETTINGS,
} from './tenant-settings.constants';

@Injectable()
export class TenantSettingsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<TenantSettingResponse[]> {
    const rows = await this.prisma.tenantSetting.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row.value]));

    return Object.entries(KNOWN_TENANT_SETTINGS).map(([key, def]) => ({
      key,
      value: byKey.has(key) ? byKey.get(key) : def.default,
      isDefault: !byKey.has(key),
    }));
  }

  async get(key: string): Promise<TenantSettingResponse> {
    if (!isKnownSettingKey(key)) {
      throw new AppException(
        'UNKNOWN_SETTING_KEY',
        'Bilinmeyen ayar anahtari.',
        HttpStatus.NOT_FOUND,
      );
    }
    const row = await this.prisma.tenantSetting.findFirst({ where: { key } });
    return {
      key,
      value: row ? row.value : KNOWN_TENANT_SETTINGS[key].default,
      isDefault: !row,
    };
  }

  async upsert(key: string, rawValue: unknown): Promise<TenantSettingResponse> {
    if (!isKnownSettingKey(key)) {
      throw new AppException(
        'UNKNOWN_SETTING_KEY',
        'Bilinmeyen ayar anahtari.',
        HttpStatus.NOT_FOUND,
      );
    }
    const parsed = KNOWN_TENANT_SETTINGS[key].schema.safeParse(rawValue);
    if (!parsed.success) {
      throw new AppException(
        'INVALID_SETTING_VALUE',
        'Ayar degeri gecersiz.',
        HttpStatus.BAD_REQUEST,
        { issues: parsed.error.issues },
      );
    }

    const existing = await this.prisma.tenantSetting.findFirst({
      where: { key },
    });
    if (existing) {
      await this.prisma.tenantSetting.update({
        where: { id: existing.id },
        data: { value: parsed.data as never },
      });
    } else {
      await this.prisma.tenantSetting.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { key, value: parsed.data } as never,
      });
    }

    await this.audit.log({
      action: 'UPDATE',
      entity: 'TenantSetting',
      entityId: key,
      meta: { value: parsed.data },
    });

    return { key, value: parsed.data, isDefault: false };
  }
}
