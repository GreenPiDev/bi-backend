import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  CalendarAttendeeStatus,
  CalendarEvent,
  CalendarEventAttendee,
} from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { FileUrlService } from '../../core/storage/file-url.service';
import { AuditService } from '../audit/audit.service';
import { CalendarSharesService } from '../calendar-shares/calendar-shares.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CalendarEventsCacheService } from './calendar-events-cache.service';
import type {
  CalendarEventQueryDto,
  CreateCalendarEventDto,
  RespondToCalendarEventDto,
  UpdateCalendarEventDto,
} from './dto/calendar-event.dto';

export type CalendarEventWithAttendees = CalendarEvent & {
  attendees: CalendarEventAttendee[];
};

export interface PendingCalendarInvite {
  attendeeId: string;
  eventId: string;
  eventTitle: string;
  eventDescription: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  creatorId: string;
  creatorName: string;
}

export interface SentCalendarInvite {
  attendeeId: string;
  eventId: string;
  eventTitle: string;
  startAt: Date;
  attendeeUserId: string;
  attendeeName: string;
  status: CalendarAttendeeStatus;
  responseNote: string | null;
  respondedAt: Date | null;
}

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

/** check-todays-reminders.processor.ts'teki formatDateTr ile ayni desen - sunucu yerel
 * saatini oldugu gibi kullanir, ayri bir Europe/Istanbul donusumu yapilmaz (kod tabaninda
 * bildirim baslıklarinda tutarli olarak izlenen yaklasim). */
function formatDateTimeTr(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()} ${hours}:${minutes}`;
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
    private readonly calendarShares: CalendarSharesService,
  ) {}

  /** create() sonrasi cagrilir, iki ayri bildirim yolu vardir:
   * 1) PENDING durumundaki her katilimciya davet bildirimi (bkz. notifyInvitedAttendees).
   * 2) Olusturan da katilimcilar arasindaysa VE etkinlik BUGUN icin kurulduysa,
   *    olusturana da aninda "bugun icin bir hatirlaticiniz var" bildirimi gider
   *    (bkz. isStartingToday). Ayni Notification turunu (CALENDAR_REMINDERS_DUE_TODAY)
   *    kullandigi icin check-todays-reminders.processor.ts'in gunluk toplu ozeti
   *    bunu da "bugun icin zaten bildirim var" sayar - cift bildirim gitmez. */
  private async notifyAttendees(
    tenantId: string,
    event: CalendarEventWithAttendees,
  ): Promise<void> {
    const pending = event.attendees.filter(
      (attendee) => attendee.status === 'PENDING',
    );
    const creatorIsAttendee = event.attendees.some(
      (attendee) => attendee.userId === event.createdById,
    );

    const tasks: Promise<unknown>[] = [];

    if (pending.length > 0) {
      tasks.push(this.notifyInvitedAttendees(tenantId, event, pending));
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

  /** PENDING durumundaki katilimcilara davet bildirimi gonderir - create()/update()
   * disinda InteractionsService (M6, gorusme formundan "takvimde kisilere gorev atama")
   * tarafindan da cagrilir, cunku o da ayni CalendarEventAttendee satirlarini yaratiyor
   * ve baska bir bildirim yolu yok (bkz. docs/VARSAYIMLAR.md). */
  async notifyInvitedAttendees(
    tenantId: string,
    event: { id: string; title: string; createdById: string },
    pendingAttendees: { userId: string }[],
  ): Promise<void> {
    if (pendingAttendees.length === 0) {
      return;
    }
    const creator = await this.prisma.user.findFirst({
      where: { id: event.createdById },
      select: { name: true },
    });
    const creatorName = creator?.name ?? 'Bir kullanici';

    await Promise.all(
      pendingAttendees.map((attendee) =>
        this.notifications.create(tenantId, {
          recipientUserId: attendee.userId,
          type: 'CALENDAR_EVENT_INVITE',
          title: `${creatorName} sizi bir etkinliğe davet etti: ${event.title}`,
          relatedEntityType: 'CalendarEvent',
          relatedEntityId: event.id,
          createdById: event.createdById,
        }),
      ),
    );
  }

  /** Zaten ACCEPTED durumundaki katilimcilara (editoru haric), etkinligin cekirdek
   * alanlari (baslik/tarih/tum gun) degistiginde bilgilendirme gonderir. */
  private async notifyEventUpdated(
    tenantId: string,
    event: CalendarEventWithAttendees,
    editorId: string,
  ): Promise<void> {
    const recipients = event.attendees.filter(
      (attendee) =>
        attendee.status === 'ACCEPTED' && attendee.userId !== editorId,
    );
    if (recipients.length === 0) {
      return;
    }
    const editor = await this.prisma.user.findFirst({
      where: { id: editorId },
      select: { name: true },
    });
    const editorName = editor?.name ?? 'Bir kullanici';

    await Promise.all(
      recipients.map((attendee) =>
        this.notifications.create(tenantId, {
          recipientUserId: attendee.userId,
          type: 'CALENDAR_EVENT_UPDATED',
          title: `${editorName} bir etkinliği güncelledi: ${event.title} (${formatDateTimeTr(event.startAt)})`,
          relatedEntityType: 'CalendarEvent',
          relatedEntityId: event.id,
          createdById: editorId,
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
   *
   * Ad-hoc (2026-09-29): katilimci daveti kabul/red akisi - bir kullanici, KENDISI
   * DAVETLI oldugu (attendee satiri olan) bir etkinligi PENDING/DECLINED oldugu
   * surece kendi takvim izgarasinda GORMEZ; sadece ACCEPTED oldugunda gorunur (bkz.
   * docs/VARSAYIMLAR.md). Davetli olmadigi (attendee satiri hic olmayan) paylasimli
   * etkinlikler icin yukaridaki "genel gorunurluk kisiti yok" kurali aynen gecerli.
   * Olusturan icin bu kisit hic uygulanmaz - kendi olusturdugu her etkinligi her
   * zaman gorur.
   *
   * `query.userId` verilirse (Ajanda paylasimi ozelligi): kendim disinda biri
   * istenmisse once CalendarShare uzerinden izin kontrol edilir, sonra sonuc
   * TAMAMEN farkli bir kurala gore filtrelenir - "kendim" gorunumundeki tenant
   * genelindeki paylasimli-etkinlik birlestirmesi degil, sadece o kullanicinin
   * ACCEPTED katilimci oldugu etkinlikler (onun kendi ajandasina bakiyormus gibi).
   * `query` (userId dahil) cache anahtarina girdigi icin farkli goruntulenen
   * kullanicilar ayri cache anahtarlarina duser (bkz. calendar-events-cache.service.ts).
   */
  async list(
    query: CalendarEventQueryDto,
    currentUserId: string,
  ): Promise<CalendarEventWithAttendees[]> {
    const targetUserId = query.userId ?? currentUserId;
    if (targetUserId !== currentUserId) {
      const allowed = await this.calendarShares.canView(
        targetUserId,
        currentUserId,
      );
      if (!allowed) {
        throw new AppException(
          'CALENDAR_NOT_SHARED',
          'Bu ajandayi goruntuleme izniniz yok.',
          HttpStatus.FORBIDDEN,
        );
      }
    }

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

    if (targetUserId === currentUserId) {
      return result.filter((event) => {
        if (event.createdById === currentUserId) {
          return true;
        }
        const own = event.attendees.find((a) => a.userId === currentUserId);
        // Kendisi davetli DEGILSE (tenant genelindeki paylasimli etkinlik
        // birlestirmesi, bkz. yukaridaki docstring) eski davranis korunur - genel
        // gorunurluk kisiti yok. Kendisi davetliyse ACCEPTED olana kadar gizlenir.
        return own ? own.status === 'ACCEPTED' : !isPrivateToCreator(event);
      });
    }
    return result.filter((event) => {
      const attendee = event.attendees.find((a) => a.userId === targetUserId);
      return attendee?.status === 'ACCEPTED';
    });
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
    const rawAttendees = dto.attendees?.length
      ? dto.attendees
      : [{ userId: createdById }];
    await this.assertUsersExist(rawAttendees.map((a) => a.userId));
    if (dto.reminderType) {
      await this.assertValidReminderType(dto.reminderType);
    }
    const attendeesData = rawAttendees.map((attendee) =>
      attendee.userId === createdById
        ? { ...attendee, status: 'ACCEPTED' as const, respondedAt: new Date() }
        : { ...attendee, status: 'PENDING' as const },
    );
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
        isMeeting: dto.isMeeting ?? false,
        attendees: { create: attendeesData },
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

  /**
   * Ad-hoc (2026-09-29): eskiden dto.attendees verildiginde TUM katilimcilar silinip
   * yeniden olusturuluyordu - bu, zaten kabul/red etmis kisilerin durumunu her
   * duzenlemede sifirliyordu. Artik fark alinir: sadece listeden cikan satirlar
   * silinir, sadece yeni eklenenler PENDING olarak yaratilir (davet gonderilir),
   * var olanlarin status/respondedAt/responseNote'una dokunulmaz (bkz. kullanici
   * onayi, docs/VARSAYIMLAR.md). `editedById` bilinmiyorsa (eski cagiranlar icin
   * geriye donuk uyumluluk) olusturanin kendisi varsayilir.
   */
  async update(
    id: string,
    dto: UpdateCalendarEventDto,
    tenantId: string,
    editedById?: string,
  ): Promise<CalendarEventWithAttendees> {
    const before = await this.findExisting(id);
    if (dto.attendees) {
      await this.assertUsersExist(dto.attendees.map((a) => a.userId));
    }
    if (dto.reminderType) {
      await this.assertValidReminderType(dto.reminderType);
    }

    const newlyInvited: { userId: string }[] = [];

    const event = await this.prisma.$transaction(async (tx) => {
      if (dto.attendees) {
        const newIds = new Set(dto.attendees.map((a) => a.userId));
        const oldByUserId = new Map(before.attendees.map((a) => [a.userId, a]));

        const toRemove = before.attendees.filter((a) => !newIds.has(a.userId));
        if (toRemove.length > 0) {
          await tx.calendarEventAttendee.deleteMany({
            where: { id: { in: toRemove.map((a) => a.id) } },
          });
        }

        for (const attendeeInput of dto.attendees) {
          const existing = oldByUserId.get(attendeeInput.userId);
          if (existing) {
            if (
              attendeeInput.note !== undefined &&
              attendeeInput.note !== existing.note
            ) {
              await tx.calendarEventAttendee.update({
                where: { id: existing.id },
                data: { note: attendeeInput.note },
              });
            }
          } else {
            const isCreator = attendeeInput.userId === before.createdById;
            await tx.calendarEventAttendee.create({
              data: {
                eventId: id,
                userId: attendeeInput.userId,
                note: attendeeInput.note,
                status: isCreator ? 'ACCEPTED' : 'PENDING',
                respondedAt: isCreator ? new Date() : undefined,
              },
            });
            if (!isCreator) {
              newlyInvited.push({ userId: attendeeInput.userId });
            }
          }
        }
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
          isMeeting: dto.isMeeting,
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

    await this.notifyInvitedAttendees(tenantId, event, newlyInvited);

    const coreChanged =
      (dto.title !== undefined && dto.title !== before.title) ||
      (dto.startAt !== undefined &&
        dto.startAt.getTime() !== before.startAt.getTime()) ||
      (dto.endAt !== undefined &&
        dto.endAt.getTime() !== before.endAt.getTime()) ||
      (dto.allDay !== undefined && dto.allDay !== before.allDay);
    if (coreChanged) {
      await this.notifyEventUpdated(
        tenantId,
        event,
        editedById ?? before.createdById,
      );
    }

    return event;
  }

  /** Davet edilen kullanicinin kendi katilimci satirina kabul/red yaniti - sadece
   * kendi satirini degistirebilir (baskasi adina yanit veremez), olusturan kendi
   * etkinligine yanit veremez (satiri zaten create()'te ACCEPTED yaratilir). */
  async respond(
    eventId: string,
    tenantId: string,
    currentUserId: string,
    dto: RespondToCalendarEventDto,
  ): Promise<CalendarEventWithAttendees> {
    const event = await this.findExisting(eventId);
    const attendee = event.attendees.find((a) => a.userId === currentUserId);
    if (!attendee) {
      throw new AppException(
        'NOT_FOUND',
        'Etkinlik bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (attendee.userId === event.createdById) {
      throw new AppException(
        'CANNOT_RESPOND_TO_OWN_EVENT',
        'Kendi olusturdugunuz etkinlige yanit veremezsiniz.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const responseNote = dto.responseNote ?? null;
    await this.prisma.calendarEventAttendee.update({
      where: { id: attendee.id },
      data: {
        status: dto.status,
        respondedAt: new Date(),
        responseNote,
      },
    });
    await this.cache.invalidate();
    emitCalendarEventChange(this.realtime, tenantId);

    const responder = await this.prisma.user.findFirst({
      where: { id: currentUserId },
      select: { name: true },
    });
    const responderName = responder?.name ?? 'Bir kullanici';
    await this.notifications.create(tenantId, {
      recipientUserId: event.createdById,
      type: 'CALENDAR_EVENT_RESPONSE',
      title:
        dto.status === 'ACCEPTED'
          ? `${responderName} davetinizi kabul etti: ${event.title}`
          : `${responderName} davetinizi reddetti: ${event.title}`,
      body: responseNote ?? undefined,
      relatedEntityType: 'CalendarEvent',
      relatedEntityId: event.id,
      createdById: currentUserId,
    });

    return this.findExisting(eventId);
  }

  /** Kullanicinin PENDING oldugu (henuz yanit vermedigi) davetler - /ajanda ustundeki
   * "kabul et/reddet" paneli icin. */
  async listPendingInvites(
    currentUserId: string,
  ): Promise<PendingCalendarInvite[]> {
    const cached = await this.cache.getPendingInvites(currentUserId);
    if (cached) {
      return cached;
    }
    const rows = await this.prisma.calendarEventAttendee.findMany({
      where: {
        userId: currentUserId,
        status: 'PENDING',
        event: { deletedAt: null },
      },
      include: { event: true },
    });
    rows.sort((a, b) => a.event.startAt.getTime() - b.event.startAt.getTime());

    const creatorIds = [...new Set(rows.map((row) => row.event.createdById))];
    const creators = creatorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true },
        })
      : [];
    const creatorNameById = new Map(creators.map((u) => [u.id, u.name]));

    const result = rows.map((row) => ({
      attendeeId: row.id,
      eventId: row.event.id,
      eventTitle: row.event.title,
      eventDescription: row.event.description,
      startAt: row.event.startAt,
      endAt: row.event.endAt,
      allDay: row.event.allDay,
      creatorId: row.event.createdById,
      creatorName:
        creatorNameById.get(row.event.createdById) ?? 'Bir kullanici',
    }));
    await this.cache.setPendingInvites(currentUserId, result);
    return result;
  }

  /** Kullanicinin olusturdugu etkinliklerde, kendisi disindaki tum katilimci
   * satirlari (bekleyen + sonuclanmis, yanit notu dahil - kabulde opsiyonel, redde
   * zorunlu) - /ajanda altindaki "gonderdigim davetler" tablosu icin. Durumdan
   * bagimsiz olarak etkinligin tarihine gore siralanir, en yeni en ustte (kullanici
   * istegi - eskiden PENDING once geliyordu, artik sadece tarih onemli). */
  async listSentInvites(currentUserId: string): Promise<SentCalendarInvite[]> {
    const rows = await this.prisma.calendarEventAttendee.findMany({
      where: {
        userId: { not: currentUserId },
        event: { createdById: currentUserId, deletedAt: null },
      },
      include: { event: true },
      orderBy: { event: { startAt: 'desc' } },
    });

    const attendeeUserIds = [...new Set(rows.map((row) => row.userId))];
    const users = attendeeUserIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: attendeeUserIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return rows.map((row) => ({
      attendeeId: row.id,
      eventId: row.event.id,
      eventTitle: row.event.title,
      startAt: row.event.startAt,
      attendeeUserId: row.userId,
      attendeeName: nameById.get(row.userId) ?? 'Bir kullanici',
      status: row.status,
      responseNote: row.responseNote,
      respondedAt: row.respondedAt,
    }));
  }

  async remove(
    id: string,
    tenantId: string,
    currentUserId: string,
  ): Promise<void> {
    const existing = await this.findExisting(id);
    if (existing.createdById !== currentUserId) {
      throw new AppException(
        'NOT_EVENT_CREATOR',
        'Yalnizca etkinligi olusturan kisi silebilir.',
        HttpStatus.FORBIDDEN,
      );
    }
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
