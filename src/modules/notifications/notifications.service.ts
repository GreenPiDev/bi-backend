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

  /** /profile?tab=notifications icin - okunmus/okunmamis tumu, sayfalanmis. */
  async list(
    recipientUserId: string,
    query: NotificationQueryDto,
  ): Promise<PagedResult<Notification>> {
    const where = { recipientUserId };
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async markRead(id: string, recipientUserId: string): Promise<void> {
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
    if (existing.readAt) return;
    await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
}
