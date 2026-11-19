import { Readable } from 'node:stream';
import { AppException } from '../../core/errors/app.exception';
import { PublicSharesService } from './public-shares.service';

function createShare(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    tenantId: 't1',
    token: 'tok',
    title: 'Fiyat Teklifi TEK-1 - ACME',
    fileKey: 'PILENS/development/t1/shares/tok',
    fileName: 'TEK-1-ACME.pdf',
    contentType: 'application/pdf',
    expiresAt: null,
    revokedAt: null,
    createdById: 'u1',
    createdAt: new Date('2026-11-19T10:00:00Z'),
    ...overrides,
  };
}

function setup(share: unknown = createShare()) {
  const prisma = {
    share: {
      findUnique: vi.fn().mockResolvedValue(share),
      update: vi.fn().mockResolvedValue({}),
    },
    tenant: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: 't1', name: 'ACME', logoKey: null }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ name: 'Ali' }) },
  };
  const storage = {
    download: vi.fn().mockResolvedValue({
      body: Readable.from([Buffer.from('pdf')]),
      contentType: 'application/pdf',
      contentLength: 3,
    }),
  };
  return {
    prisma,
    storage,
    service: new PublicSharesService(prisma as never, storage as never),
  };
}

async function expectAppError(
  promise: Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).getStatus()).toBe(status);
  expect(JSON.stringify((error as AppException).getResponse())).toContain(code);
}

describe('PublicSharesService', () => {
  it('getByToken: gecersiz token 404 SHARE_NOT_FOUND', async () => {
    const { service } = setup(null);
    await expectAppError(service.getByToken('x'), 'SHARE_NOT_FOUND', 404);
  });

  it('getByToken: iptal edilmis link 410 SHARE_REVOKED', async () => {
    const { service } = setup(createShare({ revokedAt: new Date() }));
    await expectAppError(service.getByToken('tok'), 'SHARE_REVOKED', 410);
  });

  it('getByToken: suresi dolmus link 410 SHARE_EXPIRED', async () => {
    const { service } = setup(
      createShare({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expectAppError(service.getByToken('tok'), 'SHARE_EXPIRED', 410);
  });

  it('getByToken: aktif link icin dosya anahtarini sizdirmadan ozet doner', async () => {
    const { service } = setup();
    const view = await service.getByToken('tok');
    expect(view).toEqual({
      title: 'Fiyat Teklifi TEK-1 - ACME',
      fileName: 'TEK-1-ACME.pdf',
      tenantName: 'ACME',
      tenantLogoDataUrl: null,
      sharedByName: 'Ali',
      createdAt: '2026-11-19T10:00:00.000Z',
      expiresAt: null,
    });
    expect(JSON.stringify(view)).not.toContain('PILENS');
  });

  it('openFile: R2den indirir ve goruntulenme sayacini arttirir', async () => {
    const { service, prisma, storage } = setup();
    const result = await service.openFile('tok');
    expect(storage.download).toHaveBeenCalledWith(
      'PILENS/development/t1/shares/tok',
    );
    expect(prisma.share.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { viewCount: { increment: 1 }, lastViewedAt: expect.any(Date) },
    });
    expect(result.fileName).toBe('TEK-1-ACME.pdf');
  });

  it('openFile: iptal edilmis linkte dosya hic indirilmez', async () => {
    const { service, storage } = setup(createShare({ revokedAt: new Date() }));
    await expectAppError(service.openFile('tok'), 'SHARE_REVOKED', 410);
    expect(storage.download).not.toHaveBeenCalled();
  });
});
