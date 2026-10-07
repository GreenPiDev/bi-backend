import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { ContactsService } from './contacts.service';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run(
    { tenantId: 'tenant-1', userId: 'user-1', roleIds: [] },
    fn,
  );
}

const fakeAudit = { log: vi.fn() } as never;
const fakeCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  invalidate: vi.fn(),
} as never;

const CONTACT_ID = '22222222-2222-2222-2222-222222222222';
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const CREATED_BY_ID = '33333333-3333-3333-3333-333333333333';

function createContactRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONTACT_ID,
    firstName: 'Ayse',
    lastName: 'Yilmaz',
    accountId: null,
    account: null,
    ...overrides,
  };
}

function createPrisma(contactRow: unknown = createContactRow()) {
  return {
    contact: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(contactRow),
      create: vi.fn().mockResolvedValue(contactRow),
      update: vi.fn().mockResolvedValue(contactRow),
      delete: vi.fn().mockResolvedValue(contactRow),
    },
    account: {
      findFirst: vi.fn().mockResolvedValue({ id: ACCOUNT_ID }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: CONTACT_ID }]),
    departmentOption: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    titleOption: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('ContactsService', () => {
  it('getById: bulunamayan kisi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ContactsService(prisma as never, fakeAudit, fakeCache);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: var olmayan firmaya baglanmaya calisirsa INVALID_REFERENCE firlatir', async () => {
    const prisma = createPrisma();
    prisma.account.findFirst.mockResolvedValue(null);
    const service = new ContactsService(prisma as never, fakeAudit, fakeCache);
    await expect(
      service.create(CREATED_BY_ID, {
        firstName: 'Ayse',
        lastName: 'Yilmaz',
        accountId: ACCOUNT_ID,
      } as never),
    ).rejects.toMatchObject({
      code: 'INVALID_REFERENCE',
    } satisfies Partial<AppException>);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('create: gecerli firma ile kisi olusturur', async () => {
    const prisma = createPrisma();
    const service = new ContactsService(prisma as never, fakeAudit, fakeCache);
    await service.create(CREATED_BY_ID, {
      firstName: 'Ayse',
      lastName: 'Yilmaz',
      accountId: ACCOUNT_ID,
      email: '',
    } as never);
    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: {
        firstName: 'Ayse',
        lastName: 'Yilmaz',
        accountId: ACCOUNT_ID,
        email: null,
        createdById: CREATED_BY_ID,
      },
    });
  });

  it('remove: mevcut kisiyi siler', async () => {
    const prisma = createPrisma();
    const service = new ContactsService(prisma as never, fakeAudit, fakeCache);
    await service.remove(CONTACT_ID);
    expect(prisma.contact.delete).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
    });
  });

  it('update: lastContactedAt gonderilirse inactivityNotifiedAt sifirlanir', async () => {
    const prisma = createPrisma();
    const service = new ContactsService(prisma as never, fakeAudit, fakeCache);
    const date = new Date('2026-08-28T00:00:00.000Z');
    await service.update(CONTACT_ID, { lastContactedAt: date } as never);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
      data: { lastContactedAt: date, inactivityNotifiedAt: null },
    });
  });

  it('update: lastContactedAt gonderilmezse inactivityNotifiedAt dokunulmaz', async () => {
    const prisma = createPrisma();
    const service = new ContactsService(prisma as never, fakeAudit, fakeCache);
    await service.update(CONTACT_ID, { title: 'Satis Muduru' } as never);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
      data: { title: 'Satis Muduru' },
    });
  });

  it('create: tenant unvan tanimliysa listede olmayan unvan icin INVALID_TITLE firlatir', async () => {
    const prisma = createPrisma();
    prisma.titleOption.findMany.mockResolvedValue([
      { id: 't1', label: 'Satis Muduru' },
    ]);
    const service = new ContactsService(prisma as never, fakeAudit, fakeCache);
    await expect(
      service.create(CREATED_BY_ID, {
        firstName: 'Ayse',
        lastName: 'Yilmaz',
        title: 'Uydurma Unvan',
      } as never),
    ).rejects.toMatchObject({
      code: 'INVALID_TITLE',
    } satisfies Partial<AppException>);
  });

  it('create: tenant departman tanimliysa listede olmayan departman icin INVALID_DEPARTMENT firlatir', async () => {
    const prisma = createPrisma();
    prisma.departmentOption.findMany.mockResolvedValue([
      { id: 'd1', label: 'Muhasebe' },
    ]);
    const service = new ContactsService(prisma as never, fakeAudit, fakeCache);
    await expect(
      service.create(CREATED_BY_ID, {
        firstName: 'Ayse',
        lastName: 'Yilmaz',
        department: 'Uydurma Departman',
      } as never),
    ).rejects.toMatchObject({
      code: 'INVALID_DEPARTMENT',
    } satisfies Partial<AppException>);
  });

  it('list: q filtresi bagli firma adi dahil Turkce karakterlerde de aramasi icin ham sorguyla eslesen id listesine daraltir', async () => {
    const prisma = createPrisma();
    const service = new ContactsService(prisma as never, fakeAudit, fakeCache);
    await runInTenant(() =>
      service.list({
        page: 1,
        pageSize: 25,
        q: 'Acme',
      } as never),
    );
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [CONTACT_ID] },
        }),
      }),
    );
  });

  it('list: sort=account:asc, kisileri bagli firma adina gore Turkce siralar', async () => {
    const prisma = createPrisma();
    prisma.contact.findMany.mockResolvedValue([
      { ...createContactRow(), id: '1', account: { name: 'Öztürk A.Ş.' } },
      { ...createContactRow(), id: '2', account: { name: 'Acme' } },
      { ...createContactRow(), id: '3', account: null },
    ]);
    const service = new ContactsService(prisma as never, fakeAudit, fakeCache);
    const result = await service.list({
      page: 1,
      pageSize: 25,
      sort: 'account:asc',
    } as never);
    expect(result.data.map((c) => c.id)).toEqual(['3', '2', '1']);
  });

  it('list: sort=account:desc, siralamayi ters cevirir', async () => {
    const prisma = createPrisma();
    prisma.contact.findMany.mockResolvedValue([
      { ...createContactRow(), id: '1', account: { name: 'Öztürk A.Ş.' } },
      { ...createContactRow(), id: '2', account: { name: 'Acme' } },
    ]);
    const service = new ContactsService(prisma as never, fakeAudit, fakeCache);
    const result = await service.list({
      page: 1,
      pageSize: 25,
      sort: 'account:desc',
    } as never);
    expect(result.data.map((c) => c.id)).toEqual(['1', '2']);
  });

  it('list: status filtresi where kosuluna eklenir', async () => {
    const prisma = createPrisma();
    const service = new ContactsService(prisma as never, fakeAudit, fakeCache);
    await service.list({
      page: 1,
      pageSize: 25,
      status: 'INACTIVE',
    } as never);
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'INACTIVE' }),
      }),
    );
  });
});
