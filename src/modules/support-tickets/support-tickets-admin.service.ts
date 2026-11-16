import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../core/errors/app.exception';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import type {
  AdminListSupportTicketsQueryDto,
  AdminUpdateSupportTicketStatusDto,
  CreateSupportTicketMessageDto,
} from './dto/support-ticket.dto';
import { SupportTicketNotifierService } from './support-ticket-notifier.service';
import {
  ADMIN_SUPPORT_TICKET_SELECT,
  SUPPORT_TICKET_CREATED_EVENT,
  SUPPORT_TICKET_UPDATED_EVENT,
  type AdminSupportTicketView,
} from './support-ticket-view';

/**
 * Super admin tarafi: tum tenant'larin talepleri. Ham PrismaService kullanir
 * (PlatformAdminService ile ayni bypass deseni, bkz. docs/VARSAYIMLAR.md V7) -
 * yalnizca PlatformAdminGuard arkasindaki controller'dan cagrilir.
 */
@Injectable()
export class SupportTicketsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifier: SupportTicketNotifierService,
  ) {}

  listAll(
    query: AdminListSupportTicketsQueryDto,
  ): Promise<AdminSupportTicketView[]> {
    return this.prisma.supportTicket.findMany({
      where: { status: query.status, kind: query.kind },
      orderBy: { createdAt: 'desc' },
      select: ADMIN_SUPPORT_TICKET_SELECT,
    });
  }

  async updateStatus(
    id: string,
    dto: AdminUpdateSupportTicketStatusDto,
  ): Promise<AdminSupportTicketView> {
    await this.findOrThrow(id);
    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data: { status: dto.status },
      select: ADMIN_SUPPORT_TICKET_SELECT,
    });
    this.broadcast(ticket.tenant.id, ticket.id);
    return ticket;
  }

  async addMessage(
    id: string,
    adminUserId: string,
    dto: CreateSupportTicketMessageDto,
  ): Promise<AdminSupportTicketView> {
    const existing = await this.findOrThrow(id);
    await this.prisma.supportTicketMessage.create({
      data: {
        ticketId: id,
        authorType: 'ADMIN',
        authorId: adminUserId,
        body: dto.body,
      },
    });
    // updatedAt'i ilerlet (liste/form anahtarlari icin) ve guncel gorunumu dondur.
    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data: { updatedAt: new Date() },
      select: ADMIN_SUPPORT_TICKET_SELECT,
    });
    if (existing.createdById) {
      await this.notifier.notifyTicketCreator({
        ticketId: id,
        tenantId: existing.tenantId,
        recipientUserId: existing.createdById,
        reply: dto.body,
        repliedById: adminUserId,
      });
    }
    this.broadcast(ticket.tenant.id, ticket.id);
    return ticket;
  }

  private async findOrThrow(
    id: string,
  ): Promise<{ id: string; tenantId: string; createdById: string | null }> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, tenantId: true, createdById: true },
    });
    if (!ticket) {
      throw new AppException(
        'SUPPORT_TICKET_NOT_FOUND',
        'Destek talebi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return ticket;
  }

  private broadcast(tenantId: string, ticketId: string): void {
    this.realtime.emitToTenant(tenantId, SUPPORT_TICKET_UPDATED_EVENT, {
      id: ticketId,
    });
    // Ayni anda acik baska super admin oturumlari da guncel kalsin.
    this.realtime.emitToPlatformAdmins(SUPPORT_TICKET_CREATED_EVENT, {
      id: ticketId,
    });
  }
}
