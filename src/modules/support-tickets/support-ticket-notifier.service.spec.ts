import { describe, expect, it, vi } from 'vitest';
import { SupportTicketNotifierService } from './support-ticket-notifier.service';

const notice = {
  ticketId: 'ticket-1',
  tenantId: 'tenant-1',
  kind: 'PROBLEM' as const,
  message: 'Rapor acilmiyor',
  createdById: 'user-1',
};

function setup(admins: { id: string; tenantId: string }[]) {
  const prisma = {
    user: { findMany: vi.fn().mockResolvedValue(admins) },
    tenant: { findUnique: vi.fn().mockResolvedValue({ name: 'Acme' }) },
    notification: {
      createMany: vi.fn().mockResolvedValue({ count: admins.length }),
      create: vi.fn().mockResolvedValue({ id: 'n-1' }),
    },
  };
  const realtime = { emitToTenant: vi.fn() };
  const service = new SupportTicketNotifierService(
    prisma as never,
    realtime as never,
  );
  return { prisma, realtime, service };
}

describe('SupportTicketNotifierService', () => {
  it("writes one notification per active super admin in the admin's own tenant", async () => {
    const { prisma, realtime, service } = setup([
      { id: 'admin-1', tenantId: 'platform' },
      { id: 'admin-2', tenantId: 'platform' },
    ]);

    await service.notifyPlatformAdmins(notice);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isPlatformAdmin: true, isActive: true },
      }),
    );
    const { data } = prisma.notification.createMany.mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      tenantId: 'platform',
      recipientUserId: 'admin-1',
      type: 'SUPPORT_TICKET_CREATED',
      title: 'Acme yeni bir problem bildirdi',
      body: 'Rapor acilmiyor',
      relatedEntityType: 'SupportTicket',
      relatedEntityId: 'ticket-1',
    });
    expect(realtime.emitToTenant).toHaveBeenCalledWith(
      'platform',
      'notifications.notification.created',
      { recipientUserId: 'admin-2' },
    );
  });

  it('does nothing when there is no super admin', async () => {
    const { prisma, service } = setup([]);
    await service.notifyPlatformAdmins(notice);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('never throws even if writing notifications fails', async () => {
    const { prisma, service } = setup([
      { id: 'admin-1', tenantId: 'platform' },
    ]);
    prisma.notification.createMany.mockRejectedValue(new Error('db down'));
    await expect(service.notifyPlatformAdmins(notice)).resolves.toBeUndefined();
  });

  it('notifies the ticket creator in their own tenant on reply', async () => {
    const { prisma, realtime, service } = setup([]);
    await service.notifyTicketCreator({
      ticketId: 'ticket-1',
      tenantId: 'tenant-1',
      recipientUserId: 'user-1',
      reply: 'Duzeltildi',
      repliedById: 'admin-1',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        recipientUserId: 'user-1',
        type: 'SUPPORT_TICKET_REPLIED',
        body: 'Duzeltildi',
        relatedEntityType: 'SupportTicket',
        relatedEntityId: 'ticket-1',
      }),
    });
    expect(realtime.emitToTenant).toHaveBeenCalledWith(
      'tenant-1',
      'notifications.notification.created',
      { recipientUserId: 'user-1' },
    );
  });

  it('notifies admins with a USER_MESSAGE notification when the user writes', async () => {
    const { prisma, service } = setup([
      { id: 'admin-1', tenantId: 'platform' },
    ]);
    await service.notifyPlatformAdminsOfUserMessage({
      ticketId: 'ticket-1',
      tenantId: 'tenant-1',
      message: 'Hala oluyor',
      createdById: 'user-1',
    });
    const { data } = prisma.notification.createMany.mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    expect(data[0]).toMatchObject({
      recipientUserId: 'admin-1',
      type: 'SUPPORT_TICKET_USER_MESSAGE',
      title: 'Acme destek talebine yeni mesaj yazdı',
      body: 'Hala oluyor',
    });
  });
});
