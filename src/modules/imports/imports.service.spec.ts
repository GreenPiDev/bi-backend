import { TenantContext } from '../../core/tenant/tenant-context';
import { ImportsService } from './imports.service';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

const fakeAudit = { log: vi.fn() } as never;
const fakeListPdf = { render: vi.fn() } as never;
const fakeAccountsCache = { invalidate: vi.fn() } as never;
const fakeContactsCache = { invalidate: vi.fn() } as never;

function createFileParser(headers: string[], rows: string[][]) {
  return {
    parse: vi.fn().mockResolvedValue({ headers, rows: toAsyncIterable(rows) }),
  } as never;
}

function createPrisma(
  existingAccounts: Record<string, unknown>[] = [],
  existingContacts: Record<string, unknown>[] = [],
) {
  const accounts = new Map(
    existingAccounts.map((a) => [a.id as string, { ...a }]),
  );
  const contacts = new Map(
    existingContacts.map((c) => [c.id as string, { ...c }]),
  );
  let nextAccountId = accounts.size + 1;
  let nextContactId = contacts.size + 1;
  return {
    account: {
      findMany: vi.fn().mockResolvedValue(Array.from(accounts.values())),
      findFirst: vi
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            Array.from(accounts.values()).find((a) => a.id === where.id) ??
              null,
          ),
        ),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const account = { id: `acc-${nextAccountId++}`, ...data };
          accounts.set(account.id, account);
          return Promise.resolve(account);
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
            const existing = accounts.get(where.id) ?? {};
            const merged = { ...existing, ...data };
            accounts.set(where.id, merged);
            return Promise.resolve(merged);
          },
        ),
    },
    contact: {
      findMany: vi.fn().mockResolvedValue(Array.from(contacts.values())),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const contact = { id: `con-${nextContactId++}`, ...data };
          contacts.set(contact.id, contact);
          return Promise.resolve(contact);
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
            const existing = contacts.get(where.id) ?? {};
            const merged = { ...existing, ...data };
            contacts.set(where.id, merged);
            return Promise.resolve(merged);
          },
        ),
    },
  };
}

describe('ImportsService.importAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('VKN doluysa VKN alanina gore eslestirir, farkli isimli ayni VKN satiri mevcut kaydi gunceller', async () => {
    const prisma = createPrisma([
      { id: 'a1', name: 'ESKI ISIM A.S.', taxNumber: '1234567890' },
    ]);
    const service = new ImportsService(
      prisma as never,
      createFileParser(['Ad', 'VKN'], [['Yeni Isim A.S.', '1234567890']]),
      fakeAccountsCache,
      fakeContactsCache,
      fakeAudit,
      fakeListPdf,
    );

    const result = await runInTenant(() =>
      service.importAccounts(
        'u1',
        '/tmp/f.xlsx',
        'XLSX' as never,
        0,
        { name: 'Ad', taxNumber: 'VKN' },
        [],
      ),
    );

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(prisma.account.update).toHaveBeenCalledTimes(1);
    expect(prisma.account.create).not.toHaveBeenCalled();
  });

  it('VKN yoksa normalize edilmis isme gore eslestirir', async () => {
    const prisma = createPrisma([{ id: 'a1', name: 'ABC ŞİRKETİ' }]);
    const service = new ImportsService(
      prisma as never,
      createFileParser(['Ad'], [['  abc şirketi  ']]),
      fakeAccountsCache,
      fakeContactsCache,
      fakeAudit,
      fakeListPdf,
    );

    const result = await runInTenant(() =>
      service.importAccounts(
        'u1',
        '/tmp/f.xlsx',
        'XLSX' as never,
        0,
        { name: 'Ad' },
        [],
      ),
    );

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
  });

  it('eslesen kayit yoksa yeni firma olusturur', async () => {
    const prisma = createPrisma([]);
    const service = new ImportsService(
      prisma as never,
      createFileParser(['Ad'], [['Yepyeni Firma']]),
      fakeAccountsCache,
      fakeContactsCache,
      fakeAudit,
      fakeListPdf,
    );

    const result = await runInTenant(() =>
      service.importAccounts(
        'u1',
        '/tmp/f.xlsx',
        'XLSX' as never,
        0,
        { name: 'Ad' },
        [],
      ),
    );

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('bos birakilan hucre mevcut degeri silmez, dolu hucreler guncellenir', async () => {
    const prisma = createPrisma([
      {
        id: 'a1',
        name: 'ABC ŞİRKETİ',
        taxNumber: '1234567890',
        phone: '05551112233',
        city: 'Istanbul',
      },
    ]);
    const service = new ImportsService(
      prisma as never,
      // "Sehir" sutunu dosyada yok (eslenmemis) - telefon degisiyor
      createFileParser(
        ['Ad', 'VKN', 'Tel'],
        [['Abc Sirketi', '1234567890', '05559998877']],
      ),
      fakeAccountsCache,
      fakeContactsCache,
      fakeAudit,
      fakeListPdf,
    );

    await runInTenant(() =>
      service.importAccounts(
        'u1',
        '/tmp/f.xlsx',
        'XLSX' as never,
        0,
        { name: 'Ad', taxNumber: 'VKN', phone: 'Tel' },
        [],
      ),
    );

    const [[updateCall]] = prisma.account.update.mock.calls;
    expect(updateCall.data.phone).toBe('05559998877');
    expect(updateCall.data).not.toHaveProperty('city');
  });

  it('customFields birlesir (eski anahtarlar silinmez), sector/accountTypes bastan degistirilir', async () => {
    const prisma = createPrisma([
      {
        id: 'a1',
        name: 'ABC ŞİRKETİ',
        taxNumber: '1234567890',
        sector: ['Eski Sektor'],
        customFields: { eskiAlan: 'eskiDeger' },
      },
    ]);
    const service = new ImportsService(
      prisma as never,
      createFileParser(
        ['Ad', 'VKN', 'Sektor', 'OzelAlan'],
        [['Abc Sirketi', '1234567890', 'Yeni Sektor', 'yeniDeger']],
      ),
      fakeAccountsCache,
      fakeContactsCache,
      fakeAudit,
      fakeListPdf,
    );

    await runInTenant(() =>
      service.importAccounts(
        'u1',
        '/tmp/f.xlsx',
        'XLSX' as never,
        0,
        { name: 'Ad', taxNumber: 'VKN', sector: 'Sektor' },
        ['OzelAlan'],
      ),
    );

    const [[updateCall]] = prisma.account.update.mock.calls;
    expect(updateCall.data.sector).toEqual(['Yeni Sektor']);
    expect(updateCall.data.customFields).toEqual({
      eskiAlan: 'eskiDeger',
      OzelAlan: 'yeniDeger',
    });
  });
});

describe('ImportsService.importContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('e-posta doluysa e-postaya gore eslestirir (isim degismis olsa bile)', async () => {
    const prisma = createPrisma(
      [],
      [
        {
          id: 'c1',
          firstName: 'Eski',
          lastName: 'Isim',
          email: 'ayse@example.com',
        },
      ],
    );
    const service = new ImportsService(
      prisma as never,
      createFileParser(
        ['Ad', 'Soyad', 'Eposta'],
        [['Yeni', 'Isim', 'AYSE@EXAMPLE.COM']],
      ),
      fakeAccountsCache,
      fakeContactsCache,
      fakeAudit,
      fakeListPdf,
    );

    const result = await runInTenant(() =>
      service.importContacts('u1', '/tmp/f.xlsx', 'XLSX' as never, {
        firstName: 'Ad',
        lastName: 'Soyad',
        email: 'Eposta',
      }),
    );

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(prisma.contact.update).toHaveBeenCalledTimes(1);
  });

  it('e-posta yoksa ad+soyad+firma kombinasyonuna gore eslestirir', async () => {
    const accountId = '11111111-1111-4111-8111-123456789011';
    const prisma = createPrisma(
      [{ id: accountId, name: 'ACME' }],
      [
        {
          id: 'c1',
          firstName: 'Ayse',
          lastName: 'Yilmaz',
          accountId,
        },
      ],
    );
    const service = new ImportsService(
      prisma as never,
      createFileParser(
        ['Ad', 'Soyad', 'FirmaId'],
        [['ayse', 'yilmaz', accountId]],
      ),
      fakeAccountsCache,
      fakeContactsCache,
      fakeAudit,
      fakeListPdf,
    );

    const result = await runInTenant(() =>
      service.importContacts('u1', '/tmp/f.xlsx', 'XLSX' as never, {
        firstName: 'Ad',
        lastName: 'Soyad',
        accountId: 'FirmaId',
      }),
    );

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
  });

  it('ne e-posta ne firma varsa (sadece ad-soyad) her zaman yeni kayit olusturur', async () => {
    const prisma = createPrisma(
      [],
      [{ id: 'c1', firstName: 'Ayse', lastName: 'Yilmaz' }],
    );
    const service = new ImportsService(
      prisma as never,
      createFileParser(['Ad', 'Soyad'], [['Ayse', 'Yilmaz']]),
      fakeAccountsCache,
      fakeContactsCache,
      fakeAudit,
      fakeListPdf,
    );

    const result = await runInTenant(() =>
      service.importContacts('u1', '/tmp/f.xlsx', 'XLSX' as never, {
        firstName: 'Ad',
        lastName: 'Soyad',
      }),
    );

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('ikinci dosyada ayni dosyanin aynisi + 1 yeni satir: 1 created, N updated', async () => {
    const prisma = createPrisma(
      [],
      [
        { id: 'c1', firstName: 'Ayse', lastName: 'Yilmaz', email: 'a@x.com' },
        { id: 'c2', firstName: 'Mehmet', lastName: 'Kaya', email: 'm@x.com' },
      ],
    );
    const service = new ImportsService(
      prisma as never,
      createFileParser(
        ['Ad', 'Soyad', 'Eposta'],
        [
          ['Ayse', 'Yilmaz', 'a@x.com'],
          ['Mehmet', 'Kaya', 'm@x.com'],
          ['Yeni', 'Kisi', 'yeni@x.com'],
        ],
      ),
      fakeAccountsCache,
      fakeContactsCache,
      fakeAudit,
      fakeListPdf,
    );

    const result = await runInTenant(() =>
      service.importContacts('u1', '/tmp/f.xlsx', 'XLSX' as never, {
        firstName: 'Ad',
        lastName: 'Soyad',
        email: 'Eposta',
      }),
    );

    expect(result.created).toBe(1);
    expect(result.updated).toBe(2);
  });
});
