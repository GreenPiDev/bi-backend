import { QuoteImportsService } from './quote-imports.service';

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const invalidate = vi.fn();
const fakeQuotesCache = { invalidate } as never;

function createFileParser(headers: string[], rows: string[][]) {
  return {
    parse: vi.fn().mockResolvedValue({ headers, rows: toAsyncIterable(rows) }),
  } as never;
}

function createPrisma(
  existingAccounts: Record<string, unknown>[] = [],
  existingQuotes: Record<string, unknown>[] = [],
  existingUsers: Record<string, unknown>[] = [],
  existingContacts: Record<string, unknown>[] = [],
) {
  const accounts = new Map(
    existingAccounts.map((a) => [a.name as string, { ...a }]),
  );
  const quotes = new Map(
    existingQuotes.map((q) => [q.quoteNumber as string, { ...q }]),
  );
  const contacts: Record<string, unknown>[] = [...existingContacts];
  let nextAccountId = existingAccounts.length + 1;
  let nextQuoteId = existingQuotes.length + 1;
  let nextContactId = existingContacts.length + 1;

  const tx = {
    account: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }: { where: { name: string } }) =>
          Promise.resolve(accounts.get(where.name) ?? null),
        ),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const account: Record<string, unknown> = {
            id: `acc-${nextAccountId++}`,
            ...data,
          };
          accounts.set(account.name as string, account);
          return Promise.resolve(account);
        }),
    },
    quote: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }: { where: { quoteNumber: string } }) =>
          Promise.resolve(
            [...quotes.values()].find(
              (q) => q.quoteNumber === where.quoteNumber,
            ) ?? null,
          ),
        ),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const quote: Record<string, unknown> = {
            id: `quote-${nextQuoteId++}`,
            ...data,
          };
          quotes.set(quote.quoteNumber as string, quote);
          return Promise.resolve(quote);
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
            const existing = [...quotes.values()].find(
              (q) => q.id === where.id,
            )!;
            const merged = { ...existing, ...data };
            quotes.set(merged.quoteNumber as string, merged);
            return Promise.resolve(merged);
          },
        ),
    },
    user: {
      findFirst: vi
        .fn()
        .mockImplementation(
          ({ where }: { where: { name: { equals: string } } }) =>
            Promise.resolve(
              existingUsers.find(
                (u) =>
                  (u.name as string).toLowerCase() ===
                  where.name.equals.toLowerCase(),
              ) ?? null,
            ),
        ),
    },
    contact: {
      findFirst: vi.fn().mockImplementation(
        ({
          where,
        }: {
          where: {
            accountId: string;
            firstName: { equals: string };
            lastName: { equals: string };
          };
        }) =>
          Promise.resolve(
            contacts.find(
              (c) =>
                c.accountId === where.accountId &&
                (c.firstName as string).toLowerCase() ===
                  where.firstName.equals.toLowerCase() &&
                (c.lastName as string).toLowerCase() ===
                  where.lastName.equals.toLowerCase(),
            ) ?? null,
          ),
      ),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const contact: Record<string, unknown> = {
            id: `contact-${nextContactId++}`,
            ...data,
          };
          contacts.push(contact);
          return Promise.resolve(contact);
        }),
    },
  };

  return {
    $transaction: vi
      .fn()
      .mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(tx)),
      ),
    accounts,
    quotes,
    contacts,
  };
}

describe('QuoteImportsService.importQuotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('kalemsiz (MANUAL_TOTAL) yeni teklif olusturur, firma yoksa otomatik acar', async () => {
    const prisma = createPrisma();
    const service = new QuoteImportsService(
      prisma as never,
      createFileParser(
        ['Tarih', 'Teklif No', 'Firma Adi', 'Tutar', 'Kdvli Tutar'],
        [['2026-09-23', 'S26-00323', '  abc sirketi  ', '2000', '2400']],
      ),
      fakeQuotesCache,
      fakeAudit,
    );

    const result = await service.importQuotes(
      'file.xlsx',
      'XLSX' as never,
      0,
      {
        quoteDate: 'Tarih',
        quoteNumber: 'Teklif No',
        accountName: 'Firma Adi',
        subtotal: 'Tutar',
        totalWithVat: 'Kdvli Tutar',
      },
      [],
      'tr',
      'user-1',
    );

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
    const quote = [...prisma.quotes.values()][0] as Record<string, unknown>;
    expect(quote.itemsEntryMode).toBe('MANUAL_TOTAL');
    expect(quote.manualSubtotal).toBe(2000);
    expect(quote.manualVatAmount).toBe(400);
    expect(quote.status).toBe('UNSPECIFIED');
    const account = [...prisma.accounts.values()][0] as Record<string, unknown>;
    expect(account.name).toBe('ABC SİRKETİ');
  });

  it('ayni Teklif No ile tekrar yuklenirse mevcut teklifi gunceller, ikinci bir firma olusturmaz', async () => {
    const prisma = createPrisma(
      [{ id: 'acc-1', name: 'ABC SİRKETİ' }],
      [
        {
          id: 'q-1',
          quoteNumber: 'S26-00323',
          manualSubtotal: 1000,
          itemsEntryMode: 'MANUAL_TOTAL',
        },
      ],
    );
    const service = new QuoteImportsService(
      prisma as never,
      createFileParser(
        ['Tarih', 'Teklif No', 'Firma Adi', 'Tutar'],
        [['2026-09-23', 'S26-00323', 'ABC Sirketi', '2000']],
      ),
      fakeQuotesCache,
      fakeAudit,
    );

    const result = await service.importQuotes(
      'file.xlsx',
      'XLSX' as never,
      0,
      {
        quoteDate: 'Tarih',
        quoteNumber: 'Teklif No',
        accountName: 'Firma Adi',
        subtotal: 'Tutar',
      },
      [],
      'tr',
      'user-1',
    );

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(prisma.accounts.size).toBe(1);
    const quote = prisma.quotes.get('S26-00323') as Record<string, unknown>;
    expect(quote.manualSubtotal).toBe(2000);
  });

  it('yeni teklifler her zaman UNSPECIFIED durumuyla acilir, tekrar importta durum ezilmez', async () => {
    const prisma = createPrisma(
      [],
      [
        {
          id: 'q-1',
          quoteNumber: 'S1',
          status: 'APPROVED',
          itemsEntryMode: 'MANUAL_TOTAL',
        },
      ],
    );
    const service = new QuoteImportsService(
      prisma as never,
      createFileParser(
        ['Tarih', 'Teklif No', 'Firma Adi', 'Tutar'],
        [
          ['2026-09-23', 'S1', 'A', '100'],
          ['2026-09-23', 'S2', 'B', '100'],
        ],
      ),
      fakeQuotesCache,
      fakeAudit,
    );

    await service.importQuotes(
      'file.xlsx',
      'XLSX' as never,
      0,
      {
        quoteDate: 'Tarih',
        quoteNumber: 'Teklif No',
        accountName: 'Firma Adi',
        subtotal: 'Tutar',
      },
      [],
      'tr',
      'user-1',
    );

    // S1 zaten vardi ve normal /teklifler ekranindan APPROVED'a getirilmisti -
    // tekrar import o durumu UNSPECIFIED'a dusurmemeli.
    expect((prisma.quotes.get('S1') as Record<string, unknown>).status).toBe(
      'APPROVED',
    );
    // S2 yeni - sabit olarak UNSPECIFIED ile acilir.
    expect((prisma.quotes.get('S2') as Record<string, unknown>).status).toBe(
      'UNSPECIFIED',
    );
  });

  it('Gonderen/Muhatap Kisi kolonlarini User/Contact kayitlarina esler, Muhatap Kisi bulunamazsa olusturur', async () => {
    const prisma = createPrisma(
      [],
      [],
      [{ id: 'user-sender', name: 'Emine Kalın' }],
    );
    const service = new QuoteImportsService(
      prisma as never,
      createFileParser(
        [
          'Tarih',
          'Teklif No',
          'Firma Adi',
          'Tutar',
          'Gonderen',
          'Muhatap Kisi',
        ],
        [['2026-09-23', 'S1', 'A', '100', 'emine kalın', 'Zeynep Hanım']],
      ),
      fakeQuotesCache,
      fakeAudit,
    );

    await service.importQuotes(
      'file.xlsx',
      'XLSX' as never,
      0,
      {
        quoteDate: 'Tarih',
        quoteNumber: 'Teklif No',
        accountName: 'Firma Adi',
        subtotal: 'Tutar',
        senderName: 'Gonderen',
        contactName: 'Muhatap Kisi',
      },
      [],
      'tr',
      'user-1',
    );

    const quote = prisma.quotes.get('S1') as Record<string, unknown>;
    expect(quote.senderId).toBe('user-sender');
    expect(quote.contactId).toBe('contact-1');
    const createdContact = prisma.contacts[0] as Record<string, unknown>;
    expect(createdContact.firstName).toBe('Zeynep');
    expect(createdContact.lastName).toBe('Hanım');
  });

  it('zorunlu alan eksikse satiri atlar ve hata raporuna ekler', async () => {
    const prisma = createPrisma();
    const service = new QuoteImportsService(
      prisma as never,
      createFileParser(
        ['Tarih', 'Teklif No', 'Firma Adi', 'Tutar'],
        [
          ['2026-09-23', 'S1', '', '100'],
          ['', 'S2', 'B', '100'],
          ['2026-09-23', 'S3', 'C', 'not-a-number'],
        ],
      ),
      fakeQuotesCache,
      fakeAudit,
    );

    const result = await service.importQuotes(
      'file.xlsx',
      'XLSX' as never,
      0,
      {
        quoteDate: 'Tarih',
        quoteNumber: 'Teklif No',
        accountName: 'Firma Adi',
        subtotal: 'Tutar',
      },
      [],
      'tr',
      'user-1',
    );

    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0].messages[0]).toContain('Firma Adi');
    expect(result.errors[1].messages[0]).toContain('Tarih');
    expect(result.errors[2].messages[0]).toContain('Tutar');
  });

  it('ozel alan olarak secilen kolonlari attributes JSONBine yazar, tekrar yuklenince birlestirir', async () => {
    const prisma = createPrisma();
    const service = new QuoteImportsService(
      prisma as never,
      createFileParser(
        [
          'Tarih',
          'Teklif No',
          'Firma Adi',
          'Tutar',
          'Proje Adi',
          'Bizden Ilgili',
        ],
        [['2026-09-23', 'S1', 'A', '100', 'EAE Pano', 'Emine Kalin']],
      ),
      fakeQuotesCache,
      fakeAudit,
    );

    await service.importQuotes(
      'file.xlsx',
      'XLSX' as never,
      0,
      {
        quoteDate: 'Tarih',
        quoteNumber: 'Teklif No',
        accountName: 'Firma Adi',
        subtotal: 'Tutar',
      },
      ['Proje Adi', 'Bizden Ilgili'],
      'tr',
      'user-1',
    );

    const quote = prisma.quotes.get('S1') as Record<string, unknown>;
    expect(quote.attributes).toEqual({
      'Proje Adi': 'EAE Pano',
      'Bizden Ilgili': 'Emine Kalin',
    });

    // Ayni dosya tekrar yuklenirse (bu kez sadece bir ozel alan secilmis olsun),
    // onceki attribute anahtarlari silinmez, sadece gelenler uzerine yazilir.
    await service.importQuotes(
      'file.xlsx',
      'XLSX' as never,
      0,
      {
        quoteDate: 'Tarih',
        quoteNumber: 'Teklif No',
        accountName: 'Firma Adi',
        subtotal: 'Tutar',
      },
      ['Proje Adi'],
      'tr',
      'user-1',
    );

    const updatedQuote = prisma.quotes.get('S1') as Record<string, unknown>;
    expect(updatedQuote.attributes).toEqual({
      'Proje Adi': 'EAE Pano',
      'Bizden Ilgili': 'Emine Kalin',
    });
  });

  it('Para Birimi kolonu satir bazinda eslenir ve normalize edilir, eslenmezse TRY varsayilir', async () => {
    const prisma = createPrisma();
    const service = new QuoteImportsService(
      prisma as never,
      createFileParser(
        ['Tarih', 'Teklif No', 'Firma Adi', 'Tutar', 'Para Birimi'],
        [
          ['2026-09-23', 'S1', 'A', '100', 'TL'],
          ['2026-09-23', 'S2', 'B', '100', '$'],
          ['2026-09-23', 'S3', 'C', '100', ''],
        ],
      ),
      fakeQuotesCache,
      fakeAudit,
    );

    await service.importQuotes(
      'file.xlsx',
      'XLSX' as never,
      0,
      {
        quoteDate: 'Tarih',
        quoteNumber: 'Teklif No',
        accountName: 'Firma Adi',
        subtotal: 'Tutar',
        currency: 'Para Birimi',
      },
      [],
      'tr',
      'user-1',
    );

    expect(
      (prisma.quotes.get('S1') as Record<string, unknown>).manualCurrency,
    ).toBe('TRY');
    expect(
      (prisma.quotes.get('S2') as Record<string, unknown>).manualCurrency,
    ).toBe('USD');
    expect(
      (prisma.quotes.get('S3') as Record<string, unknown>).manualCurrency,
    ).toBe('TRY');
  });
});
