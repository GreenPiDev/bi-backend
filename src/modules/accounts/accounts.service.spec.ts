import { AppException } from '../../core/errors/app.exception';
import { AccountsService } from './accounts.service';

const fakeAudit = { log: vi.fn() } as never;

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

function createAccountRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ACCOUNT_ID,
    name: 'Acme A.S.',
    city: 'Istanbul',
    sector: null,
    ownerId: null,
    contacts: [],
    ...overrides,
  };
}

function createPrisma(accountRow: unknown = createAccountRow()) {
  return {
    account: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(accountRow),
      create: vi.fn().mockResolvedValue(accountRow),
      update: vi.fn().mockResolvedValue(accountRow),
      delete: vi.fn().mockResolvedValue(accountRow),
    },
    sectorOption: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('AccountsService', () => {
  it('getById: bulunamayan firma icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new AccountsService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: bos string alanlari null yapar', async () => {
    const prisma = createPrisma();
    const service = new AccountsService(prisma as never, fakeAudit);
    await service.create({
      name: 'Acme A.S.',
      website: '',
      email: '',
    } as never);
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: { name: 'Acme A.S.', website: null, email: null },
    });
  });

  it('update: bulunamayan firma icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new AccountsService(prisma as never, fakeAudit);
    await expect(
      service.update(ACCOUNT_ID, { name: 'x' } as never),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('remove: mevcut firmayi siler', async () => {
    const prisma = createPrisma();
    const service = new AccountsService(prisma as never, fakeAudit);
    await service.remove(ACCOUNT_ID);
    expect(prisma.account.delete).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
    });
  });

  it('list: arama, sayfalama ve toplam sayfa hesaplar', async () => {
    const prisma = createPrisma();
    const service = new AccountsService(prisma as never, fakeAudit);
    prisma.account.count.mockResolvedValue(30);
    const result = await service.list({
      page: 2,
      pageSize: 10,
      sort: undefined,
    } as never);
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 30,
      totalPages: 3,
    });
  });

  it('getById: kritik alanlar bossa missingCriticalFields listeler', async () => {
    const prisma = createPrisma(
      createAccountRow({ taxNumber: null, phone: null, email: null }),
    );
    const service = new AccountsService(prisma as never, fakeAudit);
    const result = await service.getById(ACCOUNT_ID);
    expect(result.missingCriticalFields).toEqual(
      expect.arrayContaining(['taxNumber', 'phone', 'email', 'sector']),
    );
  });

  it('getById: tum kritik alanlar doluysa missingCriticalFields bos doner', async () => {
    const prisma = createPrisma(
      createAccountRow({
        taxNumber: '1234567890',
        phone: '+90 555 000 0000',
        email: 'a@b.com',
        sector: 'Yazilim',
        city: 'Istanbul',
      }),
    );
    const service = new AccountsService(prisma as never, fakeAudit);
    const result = await service.getById(ACCOUNT_ID);
    expect(result.missingCriticalFields).toEqual([]);
  });

  it('create: tenant sektor tanimlamamissa herhangi bir sektor kabul edilir', async () => {
    const prisma = createPrisma();
    const service = new AccountsService(prisma as never, fakeAudit);
    await expect(
      service.create({ name: 'Acme', sector: 'Herhangi' } as never),
    ).resolves.toBeDefined();
  });

  it('create: tenant sektor tanimliysa listede olmayan sektor icin INVALID_SECTOR firlatir', async () => {
    const prisma = createPrisma();
    prisma.sectorOption.findMany.mockResolvedValue([
      { id: 's1', label: 'Yazilim' },
    ]);
    const service = new AccountsService(prisma as never, fakeAudit);
    await expect(
      service.create({ name: 'Acme', sector: 'Tarim' } as never),
    ).rejects.toMatchObject({
      code: 'INVALID_SECTOR',
    } satisfies Partial<AppException>);
  });

  it('create: tenant sektor tanimliysa listedeki sektoru kabul eder', async () => {
    const prisma = createPrisma();
    prisma.sectorOption.findMany.mockResolvedValue([
      { id: 's1', label: 'Yazilim' },
    ]);
    const service = new AccountsService(prisma as never, fakeAudit);
    await expect(
      service.create({ name: 'Acme', sector: 'Yazilim' } as never),
    ).resolves.toBeDefined();
  });
});
