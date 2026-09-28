import { TenantContext } from '../../core/tenant/tenant-context';
import { ProductImportsService } from './product-imports.service';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const invalidate = vi.fn();
const fakeCache = { invalidate } as never;
const fakePriceHistoryCache = { invalidate: vi.fn() } as never;

function createFileParser(headers: string[], rows: string[][]) {
  return {
    parse: vi.fn().mockResolvedValue({ headers, rows: toAsyncIterable(rows) }),
  } as never;
}

function createPrisma(existingProducts: Record<string, unknown>[]) {
  const products = new Map(
    existingProducts.map((product) => [product.id as string, { ...product }]),
  );
  let nextId = existingProducts.length + 1;
  return {
    productList: {
      findFirst: vi.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Genel',
      }),
    },
    product: {
      findMany: vi.fn().mockResolvedValue(Array.from(products.values())),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const product = { id: `new-${nextId++}`, currency: 'TRY', ...data };
          products.set(product.id as string, product);
          return Promise.resolve(product);
        }),
      update: vi
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const existing = products.get(where.id) ?? {};
            const merged = { ...existing, ...data };
            products.set(where.id, merged);
            return Promise.resolve(merged);
          },
        ),
    },
  };
}

describe('ProductImportsService.importProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ayni ada sahip (bas/son bosluk + buyuk/kucuk harf farkli) urunu gunceller, eslenmemis alanlara dokunmaz', async () => {
    const prisma = createPrisma([
      {
        id: 'p1',
        name: 'ABB Kontaktor',
        sku: 'OLD-SKU',
        price: 1,
        currency: 'TRY',
        category: 'Eski Kategori',
        attributes: { Seri: 'A1' },
      },
    ]);
    const service = new ProductImportsService(
      prisma as never,
      createFileParser(
        ['Ad', 'Fiyat', 'Seri2'],
        [['  abb kontaktor  ', '10', 'X']],
      ),
      fakeCache,
      fakePriceHistoryCache,
      fakeAudit,
    );

    const result = await runInTenant(() =>
      service.importProducts(
        '/tmp/f.xlsx',
        'XLSX' as never,
        0,
        '11111111-1111-4111-8111-111111111111',
        { name: 'Ad', price: 'Fiyat' },
        ['Seri2'],
        'tr',
      ),
    );

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(prisma.product.update).toHaveBeenCalledTimes(1);
    const [[updateCall]] = prisma.product.update.mock.calls;
    // sku/category dosyada eslenmemis, gonderilen update verisinde olmamali
    expect(updateCall.data).not.toHaveProperty('sku');
    expect(updateCall.data).not.toHaveProperty('category');
    expect(updateCall.data.price).toBe(10);
    // attributes birlesir, eski anahtar (Seri) korunur
    expect(updateCall.data.attributes).toEqual({ Seri: 'A1', Seri2: 'X' });
  });

  it('ilk dosyada olmayan bir urun ikinci dosyada varsa yeni urun olarak eklenir', async () => {
    const prisma = createPrisma([
      { id: 'p1', name: 'Var Olan Urun', sku: 'X', currency: 'TRY' },
    ]);
    const service = new ProductImportsService(
      prisma as never,
      createFileParser(['Ad'], [['Yepyeni Urun']]),
      fakeCache,
      fakePriceHistoryCache,
      fakeAudit,
    );

    const result = await runInTenant(() =>
      service.importProducts(
        '/tmp/f.xlsx',
        'XLSX' as never,
        0,
        '11111111-1111-4111-8111-111111111111',
        { name: 'Ad' },
        [],
        'tr',
      ),
    );

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(prisma.product.create).toHaveBeenCalledTimes(1);
  });

  it('ayni dosyadaki tekrarlanan isimli iki satir: ikincisi birinciyi gunceller, iki ayri urun olusmaz', async () => {
    const prisma = createPrisma([]);
    const service = new ProductImportsService(
      prisma as never,
      createFileParser(
        ['Ad', 'Fiyat'],
        [
          ['Tekrarli Urun', '1'],
          ['tekrarli urun', '2'],
        ],
      ),
      fakeCache,
      fakePriceHistoryCache,
      fakeAudit,
    );

    const result = await runInTenant(() =>
      service.importProducts(
        '/tmp/f.xlsx',
        'XLSX' as never,
        0,
        '11111111-1111-4111-8111-111111111111',
        { name: 'Ad', price: 'Fiyat' },
        [],
        'tr',
      ),
    );

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
  });
});
