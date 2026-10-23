import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Note } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import { CalendarEventsCacheService } from '../calendar-events/calendar-events-cache.service';
import type { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';

export interface NoteReminderSummary {
  id: string;
  title: string;
  description: string | null;
  startAt: Date;
}

export type NoteWithReminder = Note & { reminder: NoteReminderSummary | null };

/**
 * CalendarEvent.relatedEntityType/-Id (gercek FK degil, serbest metin) uzerinden
 * Interaction'daki reminder ile ayni desen - bkz. prisma/schema.prisma Note dogum notu.
 */
const RELATED_ENTITY_TYPE = 'Note';

@Injectable()
export class NotesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly calendarEventsCache: CalendarEventsCacheService,
  ) {}

  private async attachReminders(notes: Note[]): Promise<NoteWithReminder[]> {
    if (notes.length === 0) {
      return [];
    }
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        relatedEntityType: RELATED_ENTITY_TYPE,
        relatedEntityId: { in: notes.map((note) => note.id) },
      },
      select: {
        id: true,
        title: true,
        description: true,
        startAt: true,
        relatedEntityId: true,
      },
    });
    const byNoteId = new Map(
      events.map((event) => [event.relatedEntityId as string, event]),
    );
    return notes.map((note) => {
      const event = byNoteId.get(note.id);
      return {
        ...note,
        reminder: event
          ? {
              id: event.id,
              title: event.title,
              description: event.description,
              startAt: event.startAt,
            }
          : null,
      };
    });
  }

  /**
   * Bana-ozel (isPrivate=true) notlar sadece olusturana gorunur, paylasimli
   * (isPrivate=false) notlari tenant'taki herkes gorur (bkz. docs/VARSAYIMLAR.md V73).
   */
  async list(userId: string): Promise<NoteWithReminder[]> {
    const notes = await this.prisma.note.findMany({
      where: { OR: [{ isPrivate: false }, { createdById: userId }] },
      orderBy: { createdAt: 'desc' },
    });
    return this.attachReminders(notes);
  }

  /** Bir notu, bana-ozelse sadece sahibine gosterecek sekilde getirir - digerleri icin
   * (paylasimli not veya sahibiyse) direkt doner, aksi halde NOT_FOUND. */
  private async findVisible(id: string, userId: string): Promise<Note> {
    const note = await this.prisma.note.findFirst({ where: { id } });
    if (!note || (note.isPrivate && note.createdById !== userId)) {
      throw new AppException(
        'NOT_FOUND',
        'Not bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return note;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateNoteDto,
  ): Promise<NoteWithReminder> {
    const note = await this.prisma.$transaction(async (tx) => {
      const created = await tx.note.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: {
          content: dto.content,
          color: dto.color,
          isPrivate: dto.isPrivate,
          createdById: userId,
        } as never,
      });
      if (dto.reminder) {
        await tx.calendarEvent.create({
          data: {
            tenantId,
            createdById: userId,
            title: dto.reminder.title,
            description: dto.reminder.description,
            startAt: dto.reminder.startAt,
            endAt: dto.reminder.startAt,
            relatedEntityType: RELATED_ENTITY_TYPE,
            relatedEntityId: created.id,
            // Hatirlatma tek muhataba (notu olusturana) ait - Interaction'daki
            // coklu-atanabilir hatirlatmanin aksine, Note'ta katilimci secimi yok.
            attendees: {
              create: [{ userId, status: 'ACCEPTED', respondedAt: new Date() }],
            },
          } as never,
        });
      }
      return created;
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'Note',
      entityId: note.id,
    });
    if (dto.reminder) {
      await this.calendarEventsCache.invalidate();
    }
    return (await this.attachReminders([note]))[0];
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateNoteDto,
  ): Promise<NoteWithReminder> {
    await this.findVisible(id, userId);
    const { tenantId } = TenantContext.getOrThrow();
    const touchesReminder = 'reminder' in dto;

    const note = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.note.update({
        where: { id },
        data: {
          ...(dto.content !== undefined ? { content: dto.content } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.isPrivate !== undefined ? { isPrivate: dto.isPrivate } : {}),
        },
      });

      if (touchesReminder) {
        const existingEvent = await tx.calendarEvent.findFirst({
          where: {
            relatedEntityType: RELATED_ENTITY_TYPE,
            relatedEntityId: id,
          },
        });
        if (dto.reminder === null) {
          if (existingEvent) {
            await tx.calendarEvent.delete({ where: { id: existingEvent.id } });
          }
        } else if (dto.reminder) {
          if (existingEvent) {
            await tx.calendarEvent.update({
              where: { id: existingEvent.id },
              data: {
                title: dto.reminder.title,
                description: dto.reminder.description,
                startAt: dto.reminder.startAt,
                endAt: dto.reminder.startAt,
              },
            });
          } else {
            await tx.calendarEvent.create({
              data: {
                tenantId,
                createdById: userId,
                title: dto.reminder.title,
                description: dto.reminder.description,
                startAt: dto.reminder.startAt,
                endAt: dto.reminder.startAt,
                relatedEntityType: RELATED_ENTITY_TYPE,
                relatedEntityId: id,
                attendees: {
                  create: [
                    { userId, status: 'ACCEPTED', respondedAt: new Date() },
                  ],
                },
              } as never,
            });
          }
        }
      }

      return updated;
    });

    await this.audit.log({
      action: 'UPDATE',
      entity: 'Note',
      entityId: note.id,
    });
    if (touchesReminder) {
      await this.calendarEventsCache.invalidate();
    }
    return (await this.attachReminders([note]))[0];
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findVisible(id, userId);
    const reminderEvent = await this.prisma.calendarEvent.findFirst({
      where: { relatedEntityType: RELATED_ENTITY_TYPE, relatedEntityId: id },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.note.delete({ where: { id } });
      if (reminderEvent) {
        await tx.calendarEvent.delete({ where: { id: reminderEvent.id } });
      }
    });
    await this.audit.log({ action: 'DELETE', entity: 'Note', entityId: id });
    if (reminderEvent) {
      await this.calendarEventsCache.invalidate();
    }
  }
}
