import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { isShareActive, SharesService } from './shares.service';

const fakeConfig = {
  getOrThrow: vi.fn().mockReturnValue('https://app.example.com/'),
} as never;

function createShareRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    tenantId: 't1',
    token: 'tok',
    resourceType: 'QUOTE',
    resourceId: 'q1',
    title: 'Fiyat Teklifi TEK-1 - ACME',
    fileKey: 'PILENS/development/t1/shares/tok',
    fileName: 'TEK-1-ACME.pdf',
    contentType: 'application/pdf',
    expiresAt: null,
    revokedAt: null,
    viewCount: 0,
    lastViewedAt: null,
    createdById: 'u1',
    createdAt: new Date('2026-11-19T10:00:00Z'),
    createdBy: { name: 'Ali' },
    ...overrides,
  };
}

function setup() {
  const prisma = {
    share: {
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve(createShareRow(data)),
        ),
      findMany: vi.fn().mockResolvedValue([createShareRow()]),
      findFirst: vi.fn().mockResolvedValue(createShareRow()),
      update: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve(createShareRow(data)),
        ),
    },
  };
  const storage = { upload: vi.fn().mockResolvedValue(undefined) };
  const audit = { log: vi.fn() };
  const service = new SharesService(
    prisma as never,
    storage as never,
    audit as never,
    fakeConfig,
  );
  return { prisma, storage, audit, service };
}

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

describe('isShareActive', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  it('iptal edilmis link aktif degil', () => {
    expect(isShareActive({ revokedAt: now, expiresAt: null }, now)).toBe(false);
  });
  it('suresi gecmis link aktif degil', () => {
    expect(
      isShareActive(
        { revokedAt: null, expiresAt: new Date('2026-11-19T11:59:59Z') },
        now,
      ),
    ).toBe(false);
  });
  it('suresiz veya suresi dolmamis link aktif', () => {
    expect(isShareActive({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(
      isShareActive(
        { revokedAt: null, expiresAt: new Date('2026-11-20T00:00:00Z') },
        now,
      ),
    ).toBe(true);
  });
});

describe('SharesService', () => {
  it('createFileShare: dosyayi tenant anahtariyla R2ye yazar, frontend linki doner', async () => {
    const { prisma, storage, audit, service } = setup();
    const before = Date.now();
    const view = await runInTenant(() =>
      service.createFileShare({
        resourceType: 'QUOTE',
        resourceId: 'q1',
        title: 'Teklif',
        file: {
          buffer: Buffer.from('pdf'),
          fileName: 'a.pdf',
          contentType: 'application/pdf',
        },
        expiresInDays: 7,
      }),
    );

    const [key, , contentType] = storage.upload.mock.calls[0] as [
      string,
      Buffer,
      string,
    ];
    expect(key).toMatch(/^PILENS\/[a-z]+\/t1\/shares\/[A-Za-z0-9_-]{32}$/);
    expect(contentType).toBe('application/pdf');

    const data = prisma.share.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe('t1');
    expect(data.createdById).toBe('u1');
    expect(key.endsWith(data.token)).toBe(true);
    const expiresMs = (data.expiresAt as Date).getTime() - before;
    expect(expiresMs).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000);
    expect(expiresMs).toBeLessThanOrEqual(7 * 86_400_000 + 1000);

    expect(view.url).toBe(`https://app.example.com/paylasim/${data.token}`);
    expect(view.isActive).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entity: 'Share' }),
    );
  });

  it('createFileShare: expiresInDays null ise suresiz link', async () => {
    const { prisma, service } = setup();
    await runInTenant(() =>
      service.createFileShare({
        resourceType: 'QUOTE',
        resourceId: 'q1',
        title: 'Teklif',
        file: { buffer: Buffer.from(''), fileName: 'a.pdf', contentType: 'x' },
        expiresInDays: null,
      }),
    );
    expect(prisma.share.create.mock.calls[0][0].data.expiresAt).toBeNull();
  });

  it('revoke: baska kaynaga ait share id icin SHARE_NOT_FOUND (404)', async () => {
    const { prisma, service } = setup();
    prisma.share.findFirst.mockResolvedValue(null);
    const error = await runInTenant(() =>
      service.revoke('QUOTE', 'q2', 's1'),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(404);
    expect(prisma.share.findFirst).toHaveBeenCalledWith({
      where: { id: 's1', resourceType: 'QUOTE', resourceId: 'q2' },
    });
    expect(prisma.share.update).not.toHaveBeenCalled();
  });

  it('revoke: revokedAt setler, zaten iptal edilmisse ilk tarihi korur', async () => {
    const { prisma, service } = setup();
    const first = new Date('2026-11-01T00:00:00Z');
    prisma.share.findFirst.mockResolvedValue(
      createShareRow({ revokedAt: first }),
    );
    const view = await runInTenant(() => service.revoke('QUOTE', 'q1', 's1'));
    expect(prisma.share.update.mock.calls[0][0].data.revokedAt).toBe(first);
    expect(view.isActive).toBe(false);
  });
});
