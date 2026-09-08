import { AppException } from '../../core/errors/app.exception';
import { ProductsService } from './products.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

const storageUpload = vi.fn().mockResolvedValue(undefined);
const storageDelete = vi.fn().mockResolvedValue(undefined);
const fakeStorage = {
  upload: storageUpload,
  delete: storageDelete,
} as never;

const fileUrlBuild = vi.fn((key: string | null, updatedAt: Date) =>
  key
    ? `https://api.example.com/files?key=${encodeURIComponent(key)}&v=${updatedAt.getTime()}`
    : null,
);
const fakeFileUrl = { build: fileUrlBuild } as never;

const FIXED_UPDATED_AT = new Date('2026-09-07T12:00:00.000Z');

function createProductRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'product-1',
    name: 'Dizustu Bilgisayar',
    sku: 'SKU-1',
    unit: 'adet',
    imageKey: null,
    updatedAt: FIXED_UPDATED_AT,
    ...overrides,
  };
}

function createPrisma(row: unknown = createProductRow()) {
  return {
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
      delete: vi.fn().mockResolvedValue(row),
    },
  };
}

// gecerli bir 1x1 PNG (magic-byte dogrulamasini gecmesi icin)
const PNG_BUFFER = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100e221bc330000000049454e44ae426082',
  'hex',
);

describe('ProductsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getById: bulunamayan urun icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductsService(
      prisma as never,
      fakeAudit,
      fakeStorage,
      fakeFileUrl,
    );
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('getById: imageKey varsa herkese acik URL + cache-buster doner', async () => {
    const prisma = createPrisma(
      createProductRow({
        imageKey: 'PILENS/development/t1/product-images/product-1.png',
      }),
    );
    const service = new ProductsService(
      prisma as never,
      fakeAudit,
      fakeStorage,
      fakeFileUrl,
    );
    const result = await service.getById('product-1');
    expect(result.imageUrl).toBe(
      `https://api.example.com/files?key=${encodeURIComponent('PILENS/development/t1/product-images/product-1.png')}&v=${FIXED_UPDATED_AT.getTime()}`,
    );
  });

  it('create: urunu olusturur ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      fakeAudit,
      fakeStorage,
      fakeFileUrl,
    );
    await service.create({
      name: 'Dizustu Bilgisayar',
      unit: 'adet',
    } as never);
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Dizustu Bilgisayar' }),
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('update: bulunamayan urun icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductsService(
      prisma as never,
      fakeAudit,
      fakeStorage,
      fakeFileUrl,
    );
    await expect(
      service.update('yok', { name: 'x' } as never),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remove: urunu siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      fakeAudit,
      fakeStorage,
      fakeFileUrl,
    );
    await service.remove('product-1');
    expect(prisma.product.delete).toHaveBeenCalledWith({
      where: { id: 'product-1' },
    });
  });

  it('remove: mevcut resmi de depodan siler', async () => {
    const prisma = createPrisma(createProductRow({ imageKey: 'old-key.png' }));
    const service = new ProductsService(
      prisma as never,
      fakeAudit,
      fakeStorage,
      fakeFileUrl,
    );
    await service.remove('product-1');
    expect(storageDelete).toHaveBeenCalledWith('old-key.png');
  });

  it('uploadImage: gecerli PNG icin urun id.ext anahtariyla yukler, imageKey gunceller', async () => {
    const prisma = createPrisma(createProductRow({ imageKey: null }));
    const service = new ProductsService(
      prisma as never,
      fakeAudit,
      fakeStorage,
      fakeFileUrl,
    );
    await service.uploadImage('product-1', 'tenant-1', {
      mimetype: 'image/png',
      buffer: PNG_BUFFER,
    });
    expect(storageUpload).toHaveBeenCalledWith(
      'PILENS/development/tenant-1/product-images/product-1.png',
      PNG_BUFFER,
      'image/png',
    );
    expect(storageDelete).not.toHaveBeenCalled();
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: {
        imageKey: 'PILENS/development/tenant-1/product-images/product-1.png',
      },
    });
  });

  it('uploadImage: ayni uzantiyla tekrar yuklenince eski anahtari silmeye calismaz (uzerine yazilir)', async () => {
    const prisma = createPrisma(
      createProductRow({
        imageKey: 'PILENS/development/tenant-1/product-images/product-1.png',
      }),
    );
    const service = new ProductsService(
      prisma as never,
      fakeAudit,
      fakeStorage,
      fakeFileUrl,
    );
    await service.uploadImage('product-1', 'tenant-1', {
      mimetype: 'image/png',
      buffer: PNG_BUFFER,
    });
    expect(storageDelete).not.toHaveBeenCalled();
  });

  it('uploadImage: farkli uzantiyla degistirilince eski anahtari siler', async () => {
    // eski gorsel .jpg olarak kayitliydi, simdi .png yukleniyor - iki farkli anahtar
    const prisma = createPrisma(
      createProductRow({
        imageKey: 'PILENS/development/tenant-1/product-images/product-1.jpg',
      }),
    );
    const service = new ProductsService(
      prisma as never,
      fakeAudit,
      fakeStorage,
      fakeFileUrl,
    );
    await service.uploadImage('product-1', 'tenant-1', {
      mimetype: 'image/png',
      buffer: PNG_BUFFER,
    });
    expect(storageDelete).toHaveBeenCalledWith(
      'PILENS/development/tenant-1/product-images/product-1.jpg',
    );
  });

  it('uploadImage: magic-byte MIME tipiyle uyusmuyorsa UNSUPPORTED_IMAGE_TYPE firlatir', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      fakeAudit,
      fakeStorage,
      fakeFileUrl,
    );
    await expect(
      service.uploadImage('product-1', 'tenant-1', {
        mimetype: 'image/png',
        buffer: Buffer.from('not-a-real-png'),
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE_TYPE' });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('removeImage: imageKey null yapar ve depodan siler', async () => {
    const prisma = createPrisma(createProductRow({ imageKey: 'old-key.png' }));
    const service = new ProductsService(
      prisma as never,
      fakeAudit,
      fakeStorage,
      fakeFileUrl,
    );
    await service.removeImage('product-1');
    expect(storageDelete).toHaveBeenCalledWith('old-key.png');
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { imageKey: null },
    });
  });
});
