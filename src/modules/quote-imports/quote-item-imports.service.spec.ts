import { TenantContext } from '../../core/tenant/tenant-context';
import { AppException } from '../../core/errors/app.exception';
import {
  QUOTE_ITEM_IMPORT_COLUMNS,
  buildImportedProductListName,
  decodeUploadedFileName,
} from './quote-item-import.format';
import { QuoteItemImportsService } from './quote-item-imports.service';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

const HEADERS = QUOTE_ITEM_IMPORT_COLUMNS.map((column) => column.header);

function createService(options: {
  headers?: string[];
  rows: string[][];
  products?: {
    id: string;
    name: string;
    sku: string | null;
    brand: string | null;
  }[];
  units?: { label: string; isDefault: boolean }[];
}) {
  let nextId = 1;
  const productCreate = vi
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: `new-${nextId++}`, brand: null, ...data }),
    );
  const productListCreate = vi
    .fn()
    .mockImplementation(({ data }: { data: { name: string } }) =>
      Promise.resolve({ id: 'list-1', name: data.name }),
    );
  const tx = {
    product: { create: productCreate },
    productList: { create: productListCreate },
  };
  const prisma = {
    product: { findMany: vi.fn().mockResolvedValue(options.products ?? []) },
    unitOption: {
      findMany: vi.fn().mockResolvedValue(
        options.units ?? [
          { label: 'adet', isDefault: true },
          { label: 'metre', isDefault: false },
        ],
      ),
    },
    $transaction: vi
      .fn()
      .mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const fileParser = {
    parse: vi.fn().mockResolvedValue({
      headers: options.headers ?? HEADERS,
      rows: toAsyncIterable(options.rows),
    }),
  };
  const emitUpdated = vi.fn();
  const service = new QuoteItemImportsService(
    prisma as never,
    fileParser as never,
    { emitUpdated } as never,
    { invalidate: vi.fn() } as never,
    { log: vi.fn() } as never,
  );
  return { service, productCreate, productListCreate, emitUpdated };
}

describe('QuoteItemImportsService.importItems', () => {
  it('kodla eslesen urunu kullanir, eslesmeyeni yeni urun listesinde olusturur', async () => {
    const { service, productCreate, productListCreate, emitUpdated } =
      createService({
        products: [{ id: 'p1', name: 'Kontaktör', sku: 'ABC-1', brand: 'ABB' }],
        rows: [
          ['abc-1', 'Farkli Ad', '', '2', '', '1.250,50', 'TL', '', '20'],
          ['', 'Yeni Kablo', 'Marka X', '10', 'Metre', '45', 'USD', '5', ''],
          ['', 'yeni kablo', '', '3', '', '45', 'USD', '', ''],
        ],
      });

    const result = await runInTenant(() =>
      service.importItems('/tmp/x.xlsx', 'XLSX', 'Teklif Listesi.xlsx'),
    );

    expect(result.items[0]).toMatchObject({
      productId: 'p1',
      quantity: 2,
      unit: 'adet',
      unitPrice: 1250.5,
      currency: 'TRY',
      discountPct: 0,
      vatPct: 20,
      brand: 'ABB',
    });
    expect(result.items[1]).toMatchObject({
      productId: 'new-1',
      unit: 'metre',
      vatPct: null,
    });
    // Dosyada ayni (bulunamayan) urun iki kez geciyor - tek urun olusturulur.
    expect(result.items[2].productId).toBe('new-1');
    expect(productCreate).toHaveBeenCalledTimes(1);
    expect(productListCreate).toHaveBeenCalledTimes(1);
    expect(result.productList?.name).toMatch(
      /^teklif-listesi-\d{4}-\d{2}-\d{2}-\d{4}$/,
    );
    expect(result.matchedCount).toBe(1);
    expect(result.createdProductCount).toBe(1);
    expect(emitUpdated).toHaveBeenCalled();
  });

  it('tum urunler eslesirse yeni liste olusturmaz', async () => {
    const { service, productListCreate } = createService({
      products: [{ id: 'p1', name: 'Kontaktör', sku: null, brand: null }],
      rows: [['', 'KONTAKTÖR ', '', '1', '', '10', '', '', '']],
    });
    const result = await runInTenant(() =>
      service.importItems('/x', 'XLSX', 'a.xlsx'),
    );
    expect(result.productList).toBeNull();
    expect(result.items[0].productId).toBe('p1');
    expect(productListCreate).not.toHaveBeenCalled();
  });

  it('sablona uymayan basliklarda INVALID_TEMPLATE doner', async () => {
    const { service } = createService({ headers: ['Ad', 'Miktar'], rows: [] });
    await expect(
      runInTenant(() => service.importItems('/x', 'XLSX', 'a.xlsx')),
    ).rejects.toMatchObject({ code: 'INVALID_TEMPLATE' });
  });

  it('hatali satir varsa hicbir sey olusturmadan butun satir hatalarini doner', async () => {
    const { service, productListCreate } = createService({
      rows: [
        ['', 'Gecerli Urun', '', '1', '', '10', '', '', ''],
        ['', 'X', '', 'abc', 'koli', '', '', '', ''],
      ],
    });
    const error = await runInTenant(() =>
      service.importItems('/x', 'XLSX', 'a.xlsx'),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('IMPORT_ROWS_INVALID');
    const details = (error as AppException).details as {
      errors: { row: number; messages: string[] }[];
    };
    expect(details.errors).toHaveLength(1);
    expect(details.errors[0].row).toBe(3);
    expect(details.errors[0].messages.join(' ')).toContain('Miktar');
    expect(productListCreate).not.toHaveBeenCalled();
  });

  it('bos dosyada IMPORT_EMPTY doner', async () => {
    const { service } = createService({
      rows: [['', '', '', '', '', '', '', '', '']],
    });
    await expect(
      runInTenant(() => service.importItems('/x', 'XLSX', 'a.xlsx')),
    ).rejects.toMatchObject({ code: 'IMPORT_EMPTY' });
  });
});

describe('buildImportedProductListName', () => {
  it('dosya adini sluglar ve Istanbul saatiyle tarih ekler', () => {
    expect(
      buildImportedProductListName(
        'Müşteri İhale Listesi.xlsx',
        new Date('2026-11-13T11:05:00Z'),
      ),
    ).toBe('musteri-ihale-listesi-2026-11-13-1405');
  });
});

describe('decodeUploadedFileName', () => {
  it('multer latin1 cozumlemesini geri cevirir', () => {
    const latin1 = Buffer.from('Şirket.xlsx', 'utf8').toString('latin1');
    expect(decodeUploadedFileName(latin1)).toBe('Şirket.xlsx');
    expect(decodeUploadedFileName('Özet.xlsx')).toBe('Özet.xlsx');
  });
});
