import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  Account,
  Contact,
  Interaction,
  InteractionParticipant,
  Opportunity,
} from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  CreateInteractionDto,
  InteractionQueryDto,
  UpdateInteractionDto,
} from './dto/interaction.dto';

const SORTABLE_FIELDS = ['occurredAt', 'createdAt'] as const;

const REMINDER_CONFLICT_STEP_MINUTES = 30;
const REMINDER_CONFLICT_MAX_TRIES = 48; // 24 saat, 30 dk adimlarla

export type InteractionWithDetails = Interaction & {
  account: Account;
  contact: Contact | null;
  participants: InteractionParticipant[];
  opportunity: Opportunity | null;
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

@Injectable()
export class InteractionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: InteractionQueryDto,
  ): Promise<PagedResult<InteractionWithDetails>> {
    const { page, pageSize, accountId, status } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'occurredAt',
      direction: 'desc',
    });

    const where = {
      ...(accountId ? { accountId } : {}),
      ...(status ? { status } : {}),
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

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
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
    return interaction;
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
    if (dto.reminder && dto.reminder.startAt.getTime() <= Date.now()) {
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

    const interaction = await this.prisma.$transaction(async (tx) => {
      let accountId = dto.accountId;
      let accountAutoCreated = false;
      if (!accountId && dto.accountName) {
        const account = await tx.account.create({
          data: { name: dto.accountName } as never,
        });
        accountId = account.id;
        accountAutoCreated = true;
      }
      if (!accountId) {
        throw new AppException(
          'VALIDATION_ERROR',
          'Firma belirlenemedi.',
          HttpStatus.BAD_REQUEST,
        );
      }

      let contactId = dto.contactId;
      let contactAutoCreated = false;
      if (!contactId && dto.contactName) {
        const { firstName, lastName } = splitFreeTextName(dto.contactName);
        const contact = await tx.contact.create({
          data: { accountId, firstName, lastName } as never,
        });
        contactId = contact.id;
        contactAutoCreated = true;
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

      if (dto.opportunity) {
        await tx.opportunity.create({
          data: {
            tenantId,
            createdById,
            accountId,
            interactionId: created.id,
            name: dto.opportunity.name,
            stage: dto.opportunity.stage,
            estimatedValue: dto.opportunity.estimatedValue,
          } as never,
        });
      }

      if (dto.reminder) {
        await tx.calendarEvent.create({
          data: {
            tenantId,
            createdById,
            title:
              dto.reminder.title ?? `Hatirlatma: ${dto.notes.slice(0, 60)}`,
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
  }
}
