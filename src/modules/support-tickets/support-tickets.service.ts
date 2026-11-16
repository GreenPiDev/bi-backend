import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import type {
  CreateSupportTicketDto,
  CreateSupportTicketMessageDto,
} from './dto/support-ticket.dto';
import { SupportTicketNotifierService } from './support-ticket-notifier.service';
import {
  SUPPORT_TICKET_CREATED_EVENT,
  SUPPORT_TICKET_SELECT,
  SUPPORT_TICKET_UPDATED_EVENT,
  type SupportTicketView,
} from './support-ticket-view';

/**
 * Tenant tarafi: tenant'taki herkes kendi sirketinin tum taleplerini (gonderen
 * bilgisiyle) gorur ve yazismaya katilabilir - bkz. docs/VARSAYIMLAR.md V84. Tenant
 * izolasyonu tenant-scoped extension uzerinden saglanir; SupportTicketMessage tenantId
 * tasimadigi icin her yazma isleminden once talebin bu tenant'a ait oldugu dogrulanir.
 */
@Injectable()
export class SupportTicketsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly notifier: SupportTicketNotifierService,
  ) {}

  list(): Promise<SupportTicketView[]> {
    return this.prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      select: SUPPORT_TICKET_SELECT,
    });
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateSupportTicketDto,
  ): Promise<SupportTicketView> {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId,
        kind: dto.kind,
        message: dto.message,
        createdById: userId,
      },
      select: SUPPORT_TICKET_SELECT,
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'SupportTicket',
      entityId: ticket.id,
    });
    await this.notifier.notifyPlatformAdmins({
      ticketId: ticket.id,
      tenantId,
      kind: dto.kind,
      message: dto.message,
      createdById: userId,
    });
    this.broadcast(tenantId, ticket.id);
    return ticket;
  }

  /**
   * Kapatilmis talebe yazilamaz (400). Cozuldu durumundaki talebe yazilirsa talep
   * tekrar Acik'a doner - kullanici sorunun devam ettigini soyluyor demektir.
   */
  async addMessage(
    ticketId: string,
    tenantId: string,
    userId: string,
    dto: CreateSupportTicketMessageDto,
  ): Promise<SupportTicketView> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId },
      select: { id: true, status: true },
    });
    if (!ticket) {
      throw new AppException(
        'SUPPORT_TICKET_NOT_FOUND',
        'Destek talebi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (ticket.status === 'CLOSED') {
      throw new AppException(
        'SUPPORT_TICKET_CLOSED',
        'Bu talep kapatildigi icin yeni mesaj yazilamaz. Yeni bir talep acabilirsiniz.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.supportTicketMessage.create({
      data: { ticketId, authorType: 'USER', authorId: userId, body: dto.body },
    });
    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: ticket.status === 'RESOLVED' ? { status: 'OPEN' } : {},
      select: SUPPORT_TICKET_SELECT,
    });
    await this.notifier.notifyPlatformAdminsOfUserMessage({
      ticketId,
      tenantId,
      message: dto.body,
      createdById: userId,
    });
    this.broadcast(tenantId, ticketId);
    return updated;
  }

  /** Super admin paneli ve ayni tenant'taki diger kullanicilarin listesi anlik yenilensin. */
  private broadcast(tenantId: string, ticketId: string): void {
    this.realtime.emitToPlatformAdmins(SUPPORT_TICKET_CREATED_EVENT, {
      id: ticketId,
    });
    this.realtime.emitToTenant(tenantId, SUPPORT_TICKET_UPDATED_EVENT, {
      id: ticketId,
    });
  }
}
