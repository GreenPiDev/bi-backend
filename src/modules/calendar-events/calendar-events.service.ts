import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { CalendarEvent, CalendarEventAttendee } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  CalendarEventQueryDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './dto/calendar-event.dto';

export type CalendarEventWithAttendees = CalendarEvent & {
  attendees: CalendarEventAttendee[];
};

@Injectable()
export class CalendarEventsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  /**
   * T2: katilimci/gorev atama secicisi icin - /users ucu 'settings' sayfasinin
   * 'users' tab izni gerektirir (bkz. users.controller.ts), bu yuzden CREATE/UPDATE
   * izni olmayan bir satis temsilcisi oradan kullanici listesi cekemez. Takvimde
   * herkesin birbirine gorev atayabilmesi icin (bkz. docs/VARSAYIMLAR.md V23,
   * madde 2) sadece isim/id doner, ayri ve hafif bir uc.
   */
  async listAssignableUsers(): Promise<{ id: string; name: string }[]> {
    return this.prisma.user.findMany({
      where: { isActive: true, isPlatformAdmin: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * T1/T3: tek uc hem ay gorunumunu (from/to araligiyla ortusen etkinlikler,
   * asc siralama) hem de "bizimle ilgili" ters kronolojik listeyi (order=desc)
   * besler - gorunurluk kisiti yok (bkz. docs/VARSAYIMLAR.md V23, madde 2).
   */
  async list(
    query: CalendarEventQueryDto,
  ): Promise<CalendarEventWithAttendees[]> {
    const { from, to, order } = query;
    return this.prisma.calendarEvent.findMany({
      where: {
        ...(to ? { startAt: { lte: to } } : {}),
        ...(from ? { endAt: { gte: from } } : {}),
      },
      include: { attendees: true },
      orderBy: { startAt: order },
    });
  }

  async getById(id: string): Promise<CalendarEventWithAttendees> {
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

  async create(
    tenantId: string,
    createdById: string,
    dto: CreateCalendarEventDto,
  ): Promise<CalendarEventWithAttendees> {
    const attendees = dto.attendees?.length
      ? dto.attendees
      : [{ userId: createdById }];
    const event = await this.prisma.calendarEvent.create({
      data: {
        tenantId,
        createdById,
        title: dto.title,
        description: dto.description,
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
    return event;
  }

  async update(
    id: string,
    dto: UpdateCalendarEventDto,
  ): Promise<CalendarEventWithAttendees> {
    await this.getById(id);
    const event = await this.prisma.$transaction(async (tx) => {
      if (dto.attendees) {
        await tx.calendarEventAttendee.deleteMany({ where: { eventId: id } });
      }
      return tx.calendarEvent.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
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
    return event;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.calendarEvent.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'CalendarEvent',
      entityId: id,
    });
  }
}
