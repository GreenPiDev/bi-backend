import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Notification, NotificationType } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import type { PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import type { NotificationQueryDto } from './dto/notification.dto';

/** /profile?tab=notifications yaniti - sayfalanmis liste + sayfadan bagimsiz toplam
 * okunmamis sayisi (sayfa boyutu kucuk olsa bile kullanici gercek sayiyi gorsun diye). */
export type NotificationListResult = PagedResult<Notification> & {
  unreadCount: number;
  /** Filtre butonlarindaki sayilar icin - status filtresinden bagimsiz. */
  readCount: number;
};

/** Zil ikonu dropdown'inda gosterilecek okunmamis bildirim sayisi bu deger asilirsa
 * "n+" gibi bir gosterime gecmez (kapsam disi) - sadece liste bu kadarla sinirlanir,
 * gercek toplam sayi ayri donen `total` alanindan okunur. */
const UNREAD_LIST_LIMIT = 50;

export interface CreateNotificationInput {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdById?: string;
}

/**
 * Generic, tenant-scoped bildirim mekanizmasi - AuditService gibi domain'den
 * habersiz: cagiran modul (ornegin CalendarEventsService) kendi metnini/turunu
 * verir, bu servis sadece kaydeder + ilgili kullaniciya anlik bildirir. Baska bir
 * kullanicinin bildirimini gormek/okumak imkansiz (her sorgu recipientUserId'yi
 * elle filtreler) - tenant-scoped extension sadece tenantId'yi enjekte eder, kisi
 * bazli izolasyon burada, servis katmaninda saglanir.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly realtime: RealtimeService,
  ) {}

  async create(
    tenantId: string,
    input: CreateNotificationInput,
  ): Promise<Notification> {
    const notification = await this.prisma.notification.create({
      data: {
        tenantId,
        recipientUserId: input.recipientUserId,
        type: input.type,
        title: input.title,
        body: input.body,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        createdById: input.createdById,
      },
    });
    this.realtime.emitToTenant(tenantId, 'notifications.notification.created', {
      recipientUserId: input.recipientUserId,
    });
    return notification;
  }

  /** Zil ikonu dropdown'i icin - sadece okunmamislar, en yeni en ustte. */
  async listUnread(recipientUserId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { recipientUserId, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: UNREAD_LIST_LIMIT,
    });
  }

  /** /profile?tab=notifications icin - okunmus/okunmamis tumu, sayfalanmis,
   * opsiyonel READ/UNREAD filtresiyle. Filtresiz siralama: once okunmamislar, sonra
   * okunmuslar; her grup kendi icinde en yeni en ustte. */
  async list(
    recipientUserId: string,
    query: NotificationQueryDto,
  ): Promise<NotificationListResult> {
    const [allCount, unreadCount] = await Promise.all([
      this.prisma.notification.count({ where: { recipientUserId } }),
      this.prisma.notification.count({
        where: { recipientUserId, readAt: null },
      }),
    ]);
    const readCount = allCount - unreadCount;
    const offset = (query.page - 1) * query.pageSize;

    let data: Notification[];
    let total: number;
    if (query.status === 'UNREAD') {
      data = await this.findSegment(
        recipientUserId,
        false,
        offset,
        query.pageSize,
      );
      total = unreadCount;
    } else if (query.status === 'READ') {
      data = await this.findSegment(
        recipientUserId,
        true,
        offset,
        query.pageSize,
      );
      total = readCount;
    } else {
      data = await this.findUnreadFirstPage(
        recipientUserId,
        unreadCount,
        offset,
        query.pageSize,
      );
      total = allCount;
    }
    return {
      data,
      unreadCount,
      readCount,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  /** Prisma'da kosullu (CASE) siralama olmadigi icin filtresiz sayfa iki segmentten
   * birlestirilir: okunmamislar global sirada 0..unreadCount-1, okunmuslar ondan sonra. */
  private async findUnreadFirstPage(
    recipientUserId: string,
    unreadCount: number,
    offset: number,
    pageSize: number,
  ): Promise<Notification[]> {
    const unreadTake = Math.max(0, Math.min(pageSize, unreadCount - offset));
    const readSkip = Math.max(0, offset - unreadCount);
    const readTake = pageSize - unreadTake;
    const [unread, read] = await Promise.all([
      unreadTake > 0
        ? this.findSegment(recipientUserId, false, offset, unreadTake)
        : Promise.resolve([]),
      readTake > 0
        ? this.findSegment(recipientUserId, true, readSkip, readTake)
        : Promise.resolve([]),
    ]);
    return [...unread, ...read];
  }

  private findSegment(
    recipientUserId: string,
    isRead: boolean,
    skip: number,
    take: number,
  ): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { recipientUserId, readAt: isRead ? { not: null } : null },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async setRead(
    id: string,
    recipientUserId: string,
    read: boolean,
  ): Promise<void> {
    const existing = await this.prisma.notification.findFirst({
      where: { id, recipientUserId },
    });
    if (!existing) {
      throw new AppException(
        'NOT_FOUND',
        'Bildirim bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const isRead = Boolean(existing.readAt);
    if (isRead === read) return;
    await this.prisma.notification.update({
      where: { id },
      data: { readAt: read ? new Date() : null },
    });
  }
}
