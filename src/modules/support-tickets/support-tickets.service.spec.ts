import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../../core/errors/app.exception';
import { CreateSupportTicketMessageSchema } from './dto/support-ticket.dto';
import {
  SUPPORT_TICKET_CREATED_EVENT,
  SUPPORT_TICKET_UPDATED_EVENT,
} from './support-ticket-view';
import { SupportTicketsAdminService } from './support-tickets-admin.service';
import { SupportTicketsService } from './support-tickets.service';

const ticketRow = {
  id: 'ticket-1',
  kind: 'PROBLEM',
  message: 'Rapor acilmiyor',
  status: 'OPEN',
  createdAt: new Date('2026-11-16T00:00:00.000Z'),
  updatedAt: new Date('2026-11-16T00:00:00.000Z'),
  createdBy: { id: 'user-1', name: 'Ali', email: 'ali@example.com' },
  messages: [],
  tenant: { id: 'tenant-1', name: 'Acme', slug: 'acme' },
};

function createRealtime() {
  return { emitToPlatformAdmins: vi.fn(), emitToTenant: vi.fn() };
}

describe('SupportTicketsService (tenant)', () => {
  function setup(existing: unknown = { id: 'ticket-1', status: 'OPEN' }) {
    const prisma = {
      supportTicket: {
        findMany: vi.fn().mockResolvedValue([ticketRow]),
        findFirst: vi.fn().mockResolvedValue(existing),
        create: vi.fn().mockResolvedValue(ticketRow),
        update: vi.fn().mockResolvedValue(ticketRow),
      },
      supportTicketMessage: {
        create: vi.fn().mockResolvedValue({ id: 'm-1' }),
      },
    };
    const audit = { log: vi.fn() };
    const realtime = createRealtime();
    const notifier = {
      notifyPlatformAdmins: vi.fn(),
      notifyPlatformAdminsOfUserMessage: vi.fn(),
    };
    const service = new SupportTicketsService(
      prisma as never,
      audit as never,
      realtime as never,
      notifier as never,
    );
    return { prisma, audit, realtime, notifier, service };
  }

  it('creates a ticket, audits it, notifies admins and broadcasts', async () => {
    const { prisma, audit, realtime, notifier, service } = setup();

    await service.create('tenant-1', 'user-1', {
      kind: 'SUGGESTION',
      message: 'Fikir',
    });

    expect(prisma.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tenantId: 'tenant-1',
          kind: 'SUGGESTION',
          message: 'Fikir',
          createdById: 'user-1',
        },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entity: 'SupportTicket' }),
    );
    expect(notifier.notifyPlatformAdmins).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      tenantId: 'tenant-1',
      kind: 'SUGGESTION',
      message: 'Fikir',
      createdById: 'user-1',
    });
    expect(realtime.emitToPlatformAdmins).toHaveBeenCalledWith(
      SUPPORT_TICKET_CREATED_EVENT,
      { id: 'ticket-1' },
    );
    expect(realtime.emitToTenant).toHaveBeenCalledWith(
      'tenant-1',
      SUPPORT_TICKET_UPDATED_EVENT,
      { id: 'ticket-1' },
    );
  });

  it('lists tickets newest first', async () => {
    const { prisma, service } = setup();
    await expect(service.list()).resolves.toHaveLength(1);
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('adds a USER message and notifies admins', async () => {
    const { prisma, notifier, service } = setup();
    await service.addMessage('ticket-1', 'tenant-1', 'user-1', {
      body: 'Hala oluyor',
    });

    expect(prisma.supportTicketMessage.create).toHaveBeenCalledWith({
      data: {
        ticketId: 'ticket-1',
        authorType: 'USER',
        authorId: 'user-1',
        body: 'Hala oluyor',
      },
    });
    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: {} }),
    );
    expect(notifier.notifyPlatformAdminsOfUserMessage).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      tenantId: 'tenant-1',
      message: 'Hala oluyor',
      createdById: 'user-1',
    });
  });

  it('reopens a RESOLVED ticket when the user writes again', async () => {
    const { prisma, service } = setup({ id: 'ticket-1', status: 'RESOLVED' });
    await service.addMessage('ticket-1', 'tenant-1', 'user-1', {
      body: 'Tekrar',
    });
    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'OPEN' } }),
    );
  });

  it('rejects messages on a CLOSED ticket', async () => {
    const { prisma, service } = setup({ id: 'ticket-1', status: 'CLOSED' });
    await expect(
      service.addMessage('ticket-1', 'tenant-1', 'user-1', { body: 'x' }),
    ).rejects.toMatchObject({ code: 'SUPPORT_TICKET_CLOSED' });
    expect(prisma.supportTicketMessage.create).not.toHaveBeenCalled();
  });

  it("returns 404 for another tenant's (or missing) ticket", async () => {
    const { prisma, service } = setup(null);
    await expect(
      service.addMessage('ticket-x', 'tenant-1', 'user-1', { body: 'x' }),
    ).rejects.toBeInstanceOf(AppException);
    expect(prisma.supportTicketMessage.create).not.toHaveBeenCalled();
  });
});

describe('SupportTicketsAdminService', () => {
  function setup(
    existing: unknown = {
      id: 'ticket-1',
      tenantId: 'tenant-1',
      createdById: 'user-1',
    },
  ) {
    const prisma = {
      supportTicket: {
        findMany: vi.fn().mockResolvedValue([ticketRow]),
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(ticketRow),
      },
      supportTicketMessage: {
        create: vi.fn().mockResolvedValue({ id: 'm-1' }),
      },
    };
    const realtime = createRealtime();
    const notifier = { notifyTicketCreator: vi.fn() };
    const service = new SupportTicketsAdminService(
      prisma as never,
      realtime as never,
      notifier as never,
    );
    return { prisma, realtime, notifier, service };
  }

  it('filters the cross-tenant list by status/kind', async () => {
    const { prisma, service } = setup();
    await service.listAll({ status: 'OPEN' });
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'OPEN', kind: undefined } }),
    );
  });

  it('updates the status and notifies the tenant without a bell notification', async () => {
    const { prisma, realtime, notifier, service } = setup();
    await service.updateStatus('ticket-1', { status: 'RESOLVED' });
    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'RESOLVED' } }),
    );
    expect(realtime.emitToTenant).toHaveBeenCalledWith(
      'tenant-1',
      SUPPORT_TICKET_UPDATED_EVENT,
      { id: 'ticket-1' },
    );
    expect(notifier.notifyTicketCreator).not.toHaveBeenCalled();
  });

  it('adds an ADMIN message and notifies the ticket creator', async () => {
    const { prisma, notifier, service } = setup();
    await service.addMessage('ticket-1', 'admin-1', { body: 'Duzeltildi' });
    expect(prisma.supportTicketMessage.create).toHaveBeenCalledWith({
      data: {
        ticketId: 'ticket-1',
        authorType: 'ADMIN',
        authorId: 'admin-1',
        body: 'Duzeltildi',
      },
    });
    expect(notifier.notifyTicketCreator).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      tenantId: 'tenant-1',
      recipientUserId: 'user-1',
      reply: 'Duzeltildi',
      repliedById: 'admin-1',
    });
  });

  it('skips the bell notification when the creator no longer exists', async () => {
    const { notifier, service } = setup({
      id: 'ticket-1',
      tenantId: 'tenant-1',
      createdById: null,
    });
    await service.addMessage('ticket-1', 'admin-1', { body: 'x' });
    expect(notifier.notifyTicketCreator).not.toHaveBeenCalled();
  });

  it('throws 404 for an unknown ticket', async () => {
    const { prisma, service } = setup(null);
    await expect(
      service.updateStatus('missing', { status: 'CLOSED' }),
    ).rejects.toBeInstanceOf(AppException);
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });

  it('rejects an empty message body', () => {
    expect(
      CreateSupportTicketMessageSchema.safeParse({ body: '   ' }).success,
    ).toBe(false);
  });
});
