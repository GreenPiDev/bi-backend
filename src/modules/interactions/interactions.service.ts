import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  Account,
  Contact,
  Interaction,
  InteractionParticipant,
  Opportunity,
} from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { isPastCalendarDay } from '../../core/validators/date';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AccountsCacheService } from '../accounts/accounts-cache.service';
import { CalendarEventsCacheService } from '../calendar-events/calendar-events-cache.service';
import { OpportunitiesCacheService } from '../opportunities/opportunities-cache.service';
import { AuditService } from '../audit/audit.service';
import { InteractionsCacheService } from './interactions-cache.service';
import type {
  CreateInteractionDto,
  InteractionQueryDto,
  UpdateInteractionDto,
} from './dto/interaction.dto';

const SORTABLE_FIELDS = ['occurredAt', 'createdAt'] as const;

const REMINDER_CONFLICT_STEP_MINUTES = 30;
const REMINDER_CONFLICT_MAX_TRIES = 48; // 24 saat, 30 dk adimlarla

export type InteractionWithDetails = Interaction & {
  account: Account | null;
  contact: Contact | null;
  participants: InteractionParticipant[];
  opportunity: Opportunity | null;
  createdByName: string | null;
};

export interface ReminderConflict {
  userId: string;
  suggestedStartAt: Date;
}

export interface CreateInteractionResult {
  interaction: InteractionWithDetails;
  reminderConflicts: ReminderConflict[];
}

/** M1/M2: "Ahmet Yilmaz" -> {firstName: 'Ahmet', lastName: 'Yilmaz'}; tek kelimeyse
 * Contact.lastName zorunlu oldugundan ayni deger tekrarlanir (bkz. VARSAYIMLAR V26). */
function splitFreeTextName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: trimmed };
  }
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim() || trimmed,
  };
}

const INTERACTION_INCLUDE = {
  account: true,
  contact: true,
  participants: true,
  opportunity: true,
} as const;

type InteractionRow = Interaction & {
  account: Account | null;
  contact: Contact | null;
  participants: InteractionParticipant[];
  opportunity: Opportunity | null;
};

@Injectable()
export class InteractionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly accountsCache: AccountsCacheService,
    private readonly calendarEventsCache: CalendarEventsCacheService,
    private readonly interactionsCache: InteractionsCacheService,
    private readonly opportunitiesCache: OpportunitiesCacheService,
  ) {}

  /** createdById iliskisel bir FK degil (bkz. schema); isim gostermek icin
   * User tablosundan toplu cozumleniyor. */
  private async attachCreatedByNames(
    rows: InteractionRow[],
  ): Promise<InteractionWithDetails[]> {
    const ids = [...new Set(rows.map((row) => row.createdById))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((user) => [user.id, user.name]));
    return rows.map((row) => ({
      ...row,
      createdByName: nameById.get(row.createdById) ?? null,
    }));
  }

  /** Filtre panelindeki "Oluşturan" seçicisini besler - calendar-events'teki
   * listAssignableUsers ile ayni desen. */
  async listCreators(): Promise<{ id: string; name: string }[]> {
    return this.prisma.user.findMany({
      where: { isActive: true, isPlatformAdmin: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async list(
    query: InteractionQueryDto,
  ): Promise<PagedResult<InteractionWithDetails>> {
    const cached = await this.interactionsCache.get(query);
    if (cached) {
      return cached;
    }

    const {
      page,
      pageSize,
      accountId,
      contactId,
      createdById,
      type,
      status,
      from,
      to,
    } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'occurredAt',
      direction: 'desc',
    });

    const where = {
      ...(accountId ? { accountId } : {}),
      ...(contactId ? { contactId } : {}),
      ...(createdById ? { createdById } : {}),
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.interaction.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        include: INTERACTION_INCLUDE,
      }),
      this.prisma.interaction.count({ where }),
    ]);

    const result = {
      data: await this.attachCreatedByNames(data),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
    await this.interactionsCache.set(query, result);
    return result;
  }

  async getById(id: string): Promise<InteractionWithDetails> {
    const interaction = await this.prisma.interaction.findFirst({
      where: { id },
      include: INTERACTION_INCLUDE,
    });
    if (!interaction) {
      throw new AppException(
        'NOT_FOUND',
        'Gorusme bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const [withName] = await this.attachCreatedByNames([interaction]);
    return withName;
  }

  /**
   * M7: her atanan kullanici icin ayni gun icinde bos bir sonraki 30 dakikalik
   * slotu tarar. calendarEventAttendee tenant-scoped degildir (CalendarEvent
   * gibi) ama userId zaten tek bir tenant'a ait oldugundan izolasyon riski yok
   * (bkz. calendar-events.service.ts'teki ayni desen).
   */
  private async findReminderConflicts(
    assigneeUserIds: string[],
    startAt: Date,
  ): Promise<ReminderConflict[]> {
    const conflicts: ReminderConflict[] = [];
    for (const userId of assigneeUserIds) {
      const isBusy = async (at: Date): Promise<boolean> => {
        const overlapping = await this.prisma.calendarEventAttendee.findFirst({
          where: {
            userId,
            event: { startAt: { lte: at }, endAt: { gte: at } },
          },
        });
        return overlapping !== null;
      };

      if (!(await isBusy(startAt))) {
        continue;
      }

      let suggested: Date | null = null;
      for (let i = 1; i <= REMINDER_CONFLICT_MAX_TRIES; i += 1) {
        const candidate = new Date(
          startAt.getTime() + i * REMINDER_CONFLICT_STEP_MINUTES * 60_000,
        );
        // eslint-disable-next-line no-await-in-loop
        if (!(await isBusy(candidate))) {
          suggested = candidate;
          break;
        }
      }
      conflicts.push({
        userId,
        suggestedStartAt:
          suggested ??
          new Date(
            startAt.getTime() + 24 * 60 * 60_000 /* ertesi gun ayni saat */,
          ),
      });
    }
    return conflicts;
  }

  async create(
    tenantId: string,
    createdById: string,
    dto: CreateInteractionDto,
  ): Promise<CreateInteractionResult> {
    if (dto.reminder && isPastCalendarDay(dto.reminder.startAt)) {
      throw new AppException(
        'REMINDER_PAST_DATE',
        'Hatirlatma icin gecmis bir tarih secilemez.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const reminderConflicts = dto.reminder
      ? await this.findReminderConflicts(
          dto.reminder.assignees.map((a) => a.userId),
          dto.reminder.startAt,
        )
      : [];

    let accountWasCreated = false;
    const interaction = await this.prisma.$transaction(async (tx) => {
      let accountId = dto.accountId;
      let accountAutoCreated = false;
      if (!accountId && dto.accountName) {
        const account = await tx.account.create({
          data: { name: dto.accountName, createdById } as never,
        });
        accountId = account.id;
        accountAutoCreated = true;
        accountWasCreated = true;
      }

      let contactId = dto.contactId;
      let contactAutoCreated = false;
      if (!contactId && dto.contactName) {
        const { firstName, lastName } = splitFreeTextName(dto.contactName);
        const contact = await tx.contact.create({
          data: { accountId, firstName, lastName, createdById } as never,
        });
        contactId = contact.id;
        contactAutoCreated = true;
      }

      // Firma girilmediyse (sadece kisi secildiyse), o kisinin zaten bagli
      // oldugu firmayi kullan - kullaniciya ayrica firma sordurma.
      if (!accountId && contactId) {
        const contact = await tx.contact.findUnique({
          where: { id: contactId },
          select: { accountId: true },
        });
        accountId = contact?.accountId ?? undefined;
      }

      if (!accountId && dto.opportunity) {
        throw new AppException(
          'VALIDATION_ERROR',
          'Firsat olusturmak icin firma gereklidir.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const created = await tx.interaction.create({
        data: {
          tenantId,
          createdById,
          accountId,
          contactId,
          type: dto.type,
          notes: dto.notes,
          occurredAt: dto.occurredAt,
          accountAutoCreated,
          contactAutoCreated,
          ...(dto.participants?.length
            ? { participants: { create: dto.participants } }
            : {}),
        },
      });

      if (dto.opportunity && accountId) {
        await tx.opportunity.create({
          data: {
            tenantId,
            createdById,
            accountId,
            interactionId: created.id,
            name: dto.opportunity.name,
            stage: dto.opportunity.stage,
            estimatedValue: dto.opportunity.estimatedValue,
            estimatedValueCurrency: dto.opportunity.estimatedValueCurrency,
          } as never,
        });
      }

      if (dto.reminder) {
        await tx.calendarEvent.create({
          data: {
            tenantId,
            createdById,
            title: dto.reminder.title,
            description: dto.reminder.description,
            startAt: dto.reminder.startAt,
            endAt: dto.reminder.startAt,
            relatedEntityType: 'Interaction',
            relatedEntityId: created.id,
            attendees: { create: dto.reminder.assignees },
          },
        });
      }

      return created.id;
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'Interaction',
      entityId: interaction,
    });
    if (accountWasCreated) {
      await this.accountsCache.invalidate();
    }
    if (dto.reminder) {
      await this.calendarEventsCache.invalidate();
    }
    if (dto.opportunity) {
      await this.opportunitiesCache.invalidate();
    }
    await this.interactionsCache.invalidate();

    return {
      interaction: await this.getById(interaction),
      reminderConflicts,
    };
  }

  async update(
    id: string,
    dto: UpdateInteractionDto,
  ): Promise<InteractionWithDetails> {
    await this.getById(id);
    await this.prisma.interaction.update({ where: { id }, data: dto });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'Interaction',
      entityId: id,
    });
    await this.interactionsCache.invalidate();
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.interaction.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'Interaction',
      entityId: id,
    });
    await this.interactionsCache.invalidate();
  }
}
