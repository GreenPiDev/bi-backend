import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { CalendarEvent, CalendarEventAttendee } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { FileUrlService } from '../../core/storage/file-url.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CalendarEventsCacheService } from './calendar-events-cache.service';
import type {
  CalendarEventQueryDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './dto/calendar-event.dto';

export type CalendarEventWithAttendees = CalendarEvent & {
  attendees: CalendarEventAttendee[];
};

/**
 * Katilimci secilmeden olusturulan (create() sirasinda tek katilimci olarak
 * olusturana otomatik eklenen) etkinlikler sadece olusturanin takviminde
 * gorunur. Ayri bir "visibility" alani eklenmedi - bu durum zaten
 * attendees/createdById'den turetilebiliyor (bkz. kullanici istegi,
 * docs/YOL_HARITASI.md Ajanda kaydi).
 */
function isPrivateToCreator(event: CalendarEventWithAttendees): boolean {
  return (
    event.attendees.length <= 1 &&
    event.attendees.every((a) => a.userId === event.createdById)
  );
}

/** Katilimcisi olan (paylasilan) etkinliklerin degisikligini tenant'a anlik yayinlar -
 * ozel hatirlaticilar (isPrivateToCreator) hicbir zaman yayinlanmaz. Payload'da olay
 * icerigi yok, sadece bir tetikleyici (bkz. use-calendar-events-realtime-sync.ts,
 * messages.message.created ile ayni "icerige bakma, invalidate et" deseni - gercek
 * gorunurluk filtresi zaten list()/getById() icinde uygulaniyor). */
function emitCalendarEventChange(
  realtime: RealtimeService,
  tenantId: string,
): void {
  realtime.emitToTenant(tenantId, 'calendar-events.event.changed', {});
}

/** check-todays-reminders.processor.ts'teki gunluk toplu ozet, sadece BUGUNDEN ONCE
 * kurulmus ("bugune gelmis") hatirlaticilari yakalamak icindir - ayni gun icinde
 * kurulan bir hatirlatici icin kullanici sonraki job calismasina kadar beklemek
 * istemez (bkz. kullanici geri bildirimi). Bu yuzden startAt bugunse create()
 * kendisi de aninda bir bildirim yollar. */
function isStartingToday(startAt: Date): boolean {
  const now = new Date();
  return (
    startAt.getFullYear() === now.getFullYear() &&
    startAt.getMonth() === now.getMonth() &&
    startAt.getDate() === now.getDate()
  );
}

@Injectable()
export class CalendarEventsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly fileUrl: FileUrlService,
    private readonly cache: CalendarEventsCacheService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  /** create() sonrasi cagrilir, iki ayri bildirim yolu vardir:
   * 1) Olusturan disindaki her katilimciya "size bir hatirlatici olusturuldu"
   *    (tarihten bagimsiz - kullanicinin kendi olusturdugu hatirlaticidan
   *    kendisine bu bildirim gitmemesi istendigi icin createdById elenir).
   * 2) Olusturan da katilimcilar arasindaysa VE etkinlik BUGUN icin kurulduysa,
   *    olusturana da aninda "bugun icin bir hatirlaticiniz var" bildirimi gider
   *    (bkz. isStartingToday). Ayni Notification turunu (CALENDAR_REMINDERS_DUE_TODAY)
   *    kullandigi icin check-todays-reminders.processor.ts'in gunluk toplu ozeti
   *    bunu da "bugun icin zaten bildirim var" sayar - cift bildirim gitmez. */
  private async notifyAttendees(
    tenantId: string,
    event: CalendarEventWithAttendees,
  ): Promise<void> {
    const others = event.attendees.filter(
      (attendee) => attendee.userId !== event.createdById,
    );
    const creatorIsAttendee = event.attendees.some(
      (attendee) => attendee.userId === event.createdById,
    );

    const tasks: Promise<unknown>[] = [];

    if (others.length > 0) {
      tasks.push(this.notifyOtherAttendees(tenantId, event, others));
    }

    if (creatorIsAttendee && isStartingToday(event.startAt)) {
      tasks.push(
        this.notifications.create(tenantId, {
          recipientUserId: event.createdById,
          type: 'CALENDAR_REMINDERS_DUE_TODAY',
          title: `Bugün için bir hatırlatıcınız var: ${event.title}`,
          relatedEntityType: 'CalendarEvent',
          relatedEntityId: event.id,
          createdById: event.createdById,
        }),
      );
    }

    await Promise.all(tasks);
  }

  private async notifyOtherAttendees(
    tenantId: string,
    event: CalendarEventWithAttendees,
    others: CalendarEventAttendee[],
  ): Promise<void> {
    const creator = await this.prisma.user.findFirst({
      where: { id: event.createdById },
      select: { name: true },
    });
    const creatorName = creator?.name ?? 'Bir kullanici';

    await Promise.all(
      others.map((attendee) =>
        this.notifications.create(tenantId, {
          recipientUserId: attendee.userId,
          type: 'CALENDAR_REMINDER_ASSIGNED',
          title: `${creatorName} size bir hatirlatici olusturdu: ${event.title}`,
          relatedEntityType: 'CalendarEvent',
          relatedEntityId: event.id,
          createdById: event.createdById,
        }),
      ),
    );
  }

  /**
   * T2: katilimci/gorev atama secicisi icin - /users ucu 'settings' sayfasinin
   * 'users' tab izni gerektirir (bkz. users.controller.ts), bu yuzden CREATE/UPDATE
   * izni olmayan bir satis temsilcisi oradan kullanici listesi cekemez. Takvimde
   * herkesin birbirine gorev atayabilmesi icin (bkz. docs/VARSAYIMLAR.md V23,
   * madde 2) sadece isim/id doner, ayri ve hafif bir uc. avatarUrl, gorusme
   * detayinda katilimci avatarini gostermek icin eklendi (Interaction katilimcilari
   * bu listeden secilen isimle eslesiyor).
   */
  async listAssignableUsers(): Promise<
    { id: string; name: string; avatarUrl: string | null }[]
  > {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, isPlatformAdmin: false },
      select: { id: true, name: true, avatarKey: true, updatedAt: true },
      orderBy: { name: 'asc' },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      avatarUrl: this.fileUrl.build(user.avatarKey, user.updatedAt),
    }));
  }

  /**
   * T1/T3: tek uc hem ay gorunumunu (from/to araligiyla ortusen etkinlikler,
   * asc siralama) hem de "bizimle ilgili" ters kronolojik listeyi (order=desc)
   * besler - genel gorunurluk kisiti yok (bkz. docs/VARSAYIMLAR.md V23, madde 2),
   * tek istisna: katilimci secilmeden olusturulan etkinlikler (isPrivateToCreator)
   * sadece olusturanin listesinde gorunur. Cache tum sonucu (filtresiz) tutar,
   * filtre her istekte kullaniciya gore uygulanir - boylece ayni cache anahtari
   * farkli kullanicilar arasinda guvenle paylasilabilir.
   */
  async list(
    query: CalendarEventQueryDto,
    currentUserId: string,
  ): Promise<CalendarEventWithAttendees[]> {
    const cached = await this.cache.get(query);
    const result =
      cached ??
      (await (async () => {
        const { from, to, order } = query;
        const rows = await this.prisma.calendarEvent.findMany({
          where: {
            ...(to ? { startAt: { lte: to } } : {}),
            ...(from ? { endAt: { gte: from } } : {}),
          },
          include: { attendees: true },
          orderBy: { startAt: order },
        });
        await this.cache.set(query, rows);
        return rows;
      })());

    return result.filter(
      (event) =>
        !isPrivateToCreator(event) || event.createdById === currentUserId,
    );
  }

  async getById(
    id: string,
    currentUserId: string,
  ): Promise<CalendarEventWithAttendees> {
    const event = await this.findExisting(id);
    if (isPrivateToCreator(event) && event.createdById !== currentUserId) {
      throw new AppException(
        'NOT_FOUND',
        'Etkinlik bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return event;
  }

  /** update()/remove() icin: gorunurluk kisiti uygulamadan varlik kontrolu. */
  private async findExisting(id: string): Promise<CalendarEventWithAttendees> {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id },
      include: { attendees: true },
    });
    if (!event) {
      throw new AppException(
        'NOT_FOUND',
        'Etkinlik bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return event;
  }

  /** Hatirlatici turu, tenant'in tanimladigi listeye karsi dogrulanir - gorusme sekli
   * alaniyla ayni desen (bkz. InteractionsService.assertValidInteractionType). Tenant
   * henuz hic hatirlatici turu tanimlamadiysa serbest metin kabul edilir. */
  private async assertValidReminderType(reminderType: string): Promise<void> {
    const options = await this.prisma.reminderTypeOption.findMany();
    if (options.length === 0) {
      return;
    }
    if (!options.some((option) => option.label === reminderType)) {
      throw new AppException(
        'INVALID_REMINDER_TYPE',
        'Belirtilen hatirlatici turu tanimli degil.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** Katilimci userId'leri, tenant-scoped Prisma extension'in koruyamadigi
   * bagimsiz bir alan (CalendarEventAttendee kendisi tenant-scoped degil) -
   * bkz. interactions/opportunities'teki ayni desen. */
  private async assertUsersExist(userIds: string[]): Promise<void> {
    const ids = [...new Set(userIds)];
    if (!ids.length) {
      return;
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (users.length !== ids.length) {
      throw new AppException(
        'USER_NOT_FOUND',
        'Atanan kullanicilardan biri bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async create(
    tenantId: string,
    createdById: string,
    dto: CreateCalendarEventDto,
  ): Promise<CalendarEventWithAttendees> {
    const attendees = dto.attendees?.length
      ? dto.attendees
      : [{ userId: createdById }];
    await this.assertUsersExist(attendees.map((a) => a.userId));
    if (dto.reminderType) {
      await this.assertValidReminderType(dto.reminderType);
    }
    const event = await this.prisma.calendarEvent.create({
      data: {
        tenantId,
        createdById,
        title: dto.title,
        description: dto.description,
        reminderType: dto.reminderType,
        startAt: dto.startAt,
        endAt: dto.endAt,
        allDay: dto.allDay ?? false,
        attendees: { create: attendees },
      },
      include: { attendees: true },
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'CalendarEvent',
      entityId: event.id,
      meta: { title: event.title },
    });
    await this.cache.invalidate();
    if (!isPrivateToCreator(event)) {
      emitCalendarEventChange(this.realtime, tenantId);
    }
    await this.notifyAttendees(tenantId, event);
    return event;
  }

  async update(
    id: string,
    dto: UpdateCalendarEventDto,
    tenantId: string,
  ): Promise<CalendarEventWithAttendees> {
    const before = await this.findExisting(id);
    if (dto.attendees) {
      await this.assertUsersExist(dto.attendees.map((a) => a.userId));
    }
    if (dto.reminderType) {
      await this.assertValidReminderType(dto.reminderType);
    }
    const event = await this.prisma.$transaction(async (tx) => {
      if (dto.attendees) {
        await tx.calendarEventAttendee.deleteMany({ where: { eventId: id } });
      }
      return tx.calendarEvent.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          reminderType: dto.reminderType,
          startAt: dto.startAt,
          endAt: dto.endAt,
          allDay: dto.allDay,
          ...(dto.attendees ? { attendees: { create: dto.attendees } } : {}),
        },
        include: { attendees: true },
      });
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'CalendarEvent',
      entityId: id,
    });
    await this.cache.invalidate();
    if (!isPrivateToCreator(before) || !isPrivateToCreator(event)) {
      emitCalendarEventChange(this.realtime, tenantId);
    }
    return event;
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const existing = await this.findExisting(id);
    await this.prisma.calendarEvent.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'CalendarEvent',
      entityId: id,
    });
    await this.cache.invalidate();
    if (!isPrivateToCreator(existing)) {
      emitCalendarEventChange(this.realtime, tenantId);
    }
  }
}
