import { AppException } from '../../core/errors/app.exception';
import {
  CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY,
  DEFAULT_CONTACT_INACTIVITY_THRESHOLD_DAYS,
} from './tenant-settings.constants';
import { TenantSettingsService } from './tenant-settings.service';

const fakeAudit = { log: vi.fn() };

function createPrisma(rows: unknown[] = []) {
  return {
    tenantSetting: {
      findMany: vi.fn().mockResolvedValue(rows),
      findFirst: vi.fn().mockResolvedValue(rows[0] ?? null),
      update: vi.fn().mockResolvedValue(rows[0]),
      create: vi.fn().mockResolvedValue(rows[0]),
    },
  };
}

describe('TenantSettingsService', () => {
  it('list: hicbir override yoksa varsayilan degerleri doner', async () => {
    const prisma = createPrisma([]);
    const service = new TenantSettingsService(
      prisma as never,
      fakeAudit as never,
    );
    const result = await service.list();
    expect(result).toContainEqual({
      key: CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY,
      value: DEFAULT_CONTACT_INACTIVITY_THRESHOLD_DAYS,
      isDefault: true,
    });
  });

  it('get: bilinmeyen anahtar icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma([]);
    const service = new TenantSettingsService(
      prisma as never,
      fakeAudit as never,
    );
    await expect(service.get('bilinmeyen.anahtar')).rejects.toMatchObject({
      code: 'UNKNOWN_SETTING_KEY',
    } satisfies Partial<AppException>);
  });

  it('upsert: gecersiz deger icin INVALID_SETTING_VALUE firlatir', async () => {
    const prisma = createPrisma([]);
    const service = new TenantSettingsService(
      prisma as never,
      fakeAudit as never,
    );
    await expect(
      service.upsert(CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY, -5),
    ).rejects.toMatchObject({
      code: 'INVALID_SETTING_VALUE',
    } satisfies Partial<AppException>);
  });

  it('upsert: gecerli deger icin kayit olusturur ve audit loglar', async () => {
    const prisma = createPrisma([]);
    const service = new TenantSettingsService(
      prisma as never,
      fakeAudit as never,
    );
    const result = await service.upsert(
      CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY,
      90,
    );
    expect(result.value).toBe(90);
    expect(prisma.tenantSetting.create).toHaveBeenCalledWith({
      data: { key: CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY, value: 90 },
    });
    expect(fakeAudit.log).toHaveBeenCalled();
  });

  it('upsert: mevcut kayit varsa gunceller', async () => {
    const prisma = createPrisma([
      { id: 's1', key: CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY, value: 180 },
    ]);
    const service = new TenantSettingsService(
      prisma as never,
      fakeAudit as never,
    );
    await service.upsert(CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY, 60);
    expect(prisma.tenantSetting.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { value: 60 },
    });
  });
});
