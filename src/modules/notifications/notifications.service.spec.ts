import { AppException } from '../../core/errors/app.exception';
import { NotificationsService } from './notifications.service';

const TENANT_ID = 'tenant-1';
const RECIPIENT_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

function createPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    notification: {
      create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: 'notif-1', readAt: new Date() }),
      count: vi.fn().mockResolvedValue(0),
      ...overrides,
    },
  };
}

describe('NotificationsService', () => {
  it('create: bildirimi kaydeder ve sadece tenant odasina yayinlar', async () => {
    const prisma = createPrisma();
    const emitToTenant = vi.fn();
    const service = new NotificationsService(
      prisma as never,
      { emitToTenant } as never,
    );

    await service.create(TENANT_ID, {
      recipientUserId: RECIPIENT_ID,
      type: 'CALENDAR_REMINDER_ASSIGNED',
      title: 'Test bildirimi',
    });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          recipientUserId: RECIPIENT_ID,
          type: 'CALENDAR_REMINDER_ASSIGNED',
        }),
      }),
    );
    expect(emitToTenant).toHaveBeenCalledWith(
      TENANT_ID,
      'notifications.notification.created',
      { recipientUserId: RECIPIENT_ID },
    );
  });

  it('listUnread: sadece okunmamislari, en yeni en ustte doner', async () => {
    const prisma = createPrisma();
    const service = new NotificationsService(
      prisma as never,
      {
        emitToTenant: vi.fn(),
      } as never,
    );

    await service.listUnread(RECIPIENT_ID);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientUserId: RECIPIENT_ID, readAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('setRead: baskasinin bildirimini isaretlemeye calisirsa NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    const service = new NotificationsService(
      prisma as never,
      {
        emitToTenant: vi.fn(),
      } as never,
    );

    await expect(
      service.setRead('notif-1', OTHER_USER_ID, true),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('setRead: sahibi ise readAt setler', async () => {
    const prisma = createPrisma({
      findFirst: vi.fn().mockResolvedValue({
        id: 'notif-1',
        recipientUserId: RECIPIENT_ID,
        readAt: null,
      }),
    });
    const service = new NotificationsService(
      prisma as never,
      {
        emitToTenant: vi.fn(),
      } as never,
    );

    await service.setRead('notif-1', RECIPIENT_ID, true);

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: { readAt: expect.any(Date) },
    });
  });

  it('setRead: zaten okunmussa read=true tekrar update cagirmaz', async () => {
    const prisma = createPrisma({
      findFirst: vi.fn().mockResolvedValue({
        id: 'notif-1',
        recipientUserId: RECIPIENT_ID,
        readAt: new Date('2026-01-01'),
      }),
    });
    const service = new NotificationsService(
      prisma as never,
      {
        emitToTenant: vi.fn(),
      } as never,
    );

    await service.setRead('notif-1', RECIPIENT_ID, true);

    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('setRead: read=false ile okunmus bildirimi tekrar okunmadi yapar', async () => {
    const prisma = createPrisma({
      findFirst: vi.fn().mockResolvedValue({
        id: 'notif-1',
        recipientUserId: RECIPIENT_ID,
        readAt: new Date('2026-01-01'),
      }),
    });
    const service = new NotificationsService(
      prisma as never,
      {
        emitToTenant: vi.fn(),
      } as never,
    );

    await service.setRead('notif-1', RECIPIENT_ID, false);

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: { readAt: null },
    });
  });

  it('setRead: zaten okunmamissa read=false tekrar update cagirmaz', async () => {
    const prisma = createPrisma({
      findFirst: vi.fn().mockResolvedValue({
        id: 'notif-1',
        recipientUserId: RECIPIENT_ID,
        readAt: null,
      }),
    });
    const service = new NotificationsService(
      prisma as never,
      {
        emitToTenant: vi.fn(),
      } as never,
    );

    await service.setRead('notif-1', RECIPIENT_ID, false);

    expect(prisma.notification.update).not.toHaveBeenCalled();
  });
});
