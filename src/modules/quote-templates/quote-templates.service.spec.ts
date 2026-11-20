import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import {
  DEFAULT_STANDARD_QUOTE_PDF_THEME,
  resolveStandardQuotePdfTheme,
  STANDARD_QUOTE_PDF_THEME_KEY,
} from '../tenant-settings/tenant-settings.constants';
import { QuoteTemplatesService } from './quote-templates.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const fakeRealtime = { emitToTenant: vi.fn(), emitToAll: vi.fn() };
const fakeFileUrl = { build: vi.fn(() => null) } as never;
const fakeStorage = { upload: vi.fn(), delete: vi.fn(), download: vi.fn() };
const fakeTenantSettings = {
  get: vi.fn(),
  upsert: vi.fn(),
};

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

function createTemplateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'template-1',
    name: 'GreenPi Kurumsal',
    isDefault: true,
    logoKey: null,
    coverImageKey: null,
    closingImageKey: null,
    companyDisplayName: 'Green Pi Enerji',
    updatedAt: new Date('2026-09-30T00:00:00.000Z'),
    ...overrides,
  };
}

function createPrisma(row: unknown = createTemplateRow()) {
  const prisma = {
    quoteTemplate: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue(row),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

function createService(prisma: ReturnType<typeof createPrisma>) {
  return new QuoteTemplatesService(
    prisma as never,
    fakeAudit,
    fakeRealtime as never,
    fakeStorage as never,
    fakeFileUrl,
    fakeTenantSettings as never,
  );
}

describe('QuoteTemplatesService', () => {
  it('getById: bulunamayan sablon icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = createService(prisma);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: sablonu olusturur ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);
    await runInTenant(() =>
      service.create('u1', {
        name: 'GreenPi Kurumsal',
        isDefault: false,
        companyDisplayName: 'Green Pi Enerji',
      }),
    );
    expect(prisma.quoteTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'GreenPi Kurumsal',
          createdById: 'u1',
        }),
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('create: varsayilan olarak isaretlenirse digerlerinin varsayilan bayragini kaldirir', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);
    await runInTenant(() =>
      service.create('u1', {
        name: 'GreenPi Kurumsal',
        isDefault: true,
        companyDisplayName: 'Green Pi Enerji',
      }),
    );
    expect(prisma.quoteTemplate.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  });

  it('update: bulunamayan sablon icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = createService(prisma);
    await expect(
      service.update('yok', { name: 'Yeni Ad' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('setDefault: digerlerinin varsayilan bayragini kaldirip hedefi varsayilan yapar', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);
    await runInTenant(() => service.setDefault('template-1'));
    expect(prisma.quoteTemplate.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true, id: { not: 'template-1' } },
      data: { isDefault: false },
    });
    expect(prisma.quoteTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'template-1' },
        data: { isDefault: true },
      }),
    );
  });

  it('remove: bulunamayan sablon icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = createService(prisma);
    await expect(service.remove('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remove: gorselleri storage’dan siler ve sablonu kaldirir', async () => {
    const prisma = createPrisma(
      createTemplateRow({
        logoKey: 'PILENS/dev/t1/quote-templates/x/logo.png',
      }),
    );
    const service = createService(prisma);
    await runInTenant(() => service.remove('template-1'));
    expect(fakeStorage.delete).toHaveBeenCalledWith(
      'PILENS/dev/t1/quote-templates/x/logo.png',
    );
    expect(prisma.quoteTemplate.delete).toHaveBeenCalledWith({
      where: { id: 'template-1' },
    });
    expect(auditLog).toHaveBeenCalled();
  });

  it('getStandardTheme: ayar yoksa eski sabit renklerle birebir ayni varsayilani doner', async () => {
    fakeTenantSettings.get.mockResolvedValueOnce({
      key: STANDARD_QUOTE_PDF_THEME_KEY,
      value: DEFAULT_STANDARD_QUOTE_PDF_THEME,
      isDefault: true,
    });
    const service = createService(createPrisma());
    const theme = await runInTenant(() => service.getStandardTheme());
    expect(theme.titleColor).toBe('#8bc34a');
    expect(theme.headingColor).toBe('#2196f3');
    expect(theme.rowEvenBgColor).toBe('#e8f5e9');
    expect(theme.groupRowBgColor).toBe('#e3f2fd');
  });

  it('updateStandardTheme: TenantSetting deposuna dogru anahtarla yazar', async () => {
    const next = { ...DEFAULT_STANDARD_QUOTE_PDF_THEME, titleColor: '#ff0000' };
    fakeTenantSettings.upsert.mockResolvedValueOnce({
      key: STANDARD_QUOTE_PDF_THEME_KEY,
      value: next,
      isDefault: false,
    });
    const service = createService(createPrisma());
    const saved = await runInTenant(() => service.updateStandardTheme(next));
    expect(fakeTenantSettings.upsert).toHaveBeenCalledWith(
      STANDARD_QUOTE_PDF_THEME_KEY,
      next,
    );
    expect(saved.titleColor).toBe('#ff0000');
  });

  it('resolveStandardQuotePdfTheme: eksik/gecersiz alanlar varsayilana duser', () => {
    const theme = resolveStandardQuotePdfTheme({
      titleColor: '#123456',
      headingColor: 'red',
      textColor: '#12345',
    });
    expect(theme.titleColor).toBe('#123456');
    expect(theme.headingColor).toBe(
      DEFAULT_STANDARD_QUOTE_PDF_THEME.headingColor,
    );
    expect(theme.textColor).toBe(DEFAULT_STANDARD_QUOTE_PDF_THEME.textColor);
    expect(resolveStandardQuotePdfTheme(null)).toEqual(
      DEFAULT_STANDARD_QUOTE_PDF_THEME,
    );
  });
});
