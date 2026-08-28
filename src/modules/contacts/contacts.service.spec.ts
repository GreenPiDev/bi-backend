import { AppException } from '../../core/errors/app.exception';
import { ContactsService } from './contacts.service';

const fakeAudit = { log: vi.fn() } as never;

const CONTACT_ID = '22222222-2222-2222-2222-222222222222';
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

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
  };
}

describe('ContactsService', () => {
  it('getById: bulunamayan kisi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ContactsService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: var olmayan firmaya baglanmaya calisirsa INVALID_REFERENCE firlatir', async () => {
    const prisma = createPrisma();
    prisma.account.findFirst.mockResolvedValue(null);
    const service = new ContactsService(prisma as never, fakeAudit);
    await expect(
      service.create({
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
    const service = new ContactsService(prisma as never, fakeAudit);
    await service.create({
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
      },
    });
  });

  it('remove: mevcut kisiyi siler', async () => {
    const prisma = createPrisma();
    const service = new ContactsService(prisma as never, fakeAudit);
    await service.remove(CONTACT_ID);
    expect(prisma.contact.delete).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
    });
  });

  it('update: lastContactedAt gonderilirse inactivityNotifiedAt sifirlanir', async () => {
    const prisma = createPrisma();
    const service = new ContactsService(prisma as never, fakeAudit);
    const date = new Date('2026-08-28T00:00:00.000Z');
    await service.update(CONTACT_ID, { lastContactedAt: date } as never);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
      data: { lastContactedAt: date, inactivityNotifiedAt: null },
    });
  });

  it('update: lastContactedAt gonderilmezse inactivityNotifiedAt dokunulmaz', async () => {
    const prisma = createPrisma();
    const service = new ContactsService(prisma as never, fakeAudit);
    await service.update(CONTACT_ID, { title: 'Satis Muduru' } as never);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
      data: { title: 'Satis Muduru' },
    });
  });

  it('list: status filtresi where kosuluna eklenir', async () => {
    const prisma = createPrisma();
    const service = new ContactsService(prisma as never, fakeAudit);
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
