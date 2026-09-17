import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Opportunity } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  CreateOpportunityDto,
  OpportunityQueryDto,
  UpdateOpportunityDto,
} from './dto/opportunity.dto';

const SORTABLE_FIELDS = ['name', 'stage', 'occurredAt', 'createdAt'] as const;

const REMINDER_CONFLICT_STEP_MINUTES = 30;
const REMINDER_CONFLICT_MAX_TRIES = 48; // 24 saat, 30 dk adimlarla

export interface OpportunityReminderConflict {
  userId: string;
  suggestedStartAt: Date;
}

export interface CreateOpportunityResult {
  opportunity: Opportunity;
  reminderConflicts: OpportunityReminderConflict[];
}

@Injectable()
export class OpportunitiesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(query: OpportunityQueryDto): Promise<PagedResult<Opportunity>> {
    const { page, pageSize, accountId, stage } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    const where = {
      ...(accountId ? { accountId } : {}),
      ...(stage ? { stage } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
      }),
      this.prisma.opportunity.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string): Promise<Opportunity> {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id },
    });
    if (!opportunity) {
      throw new AppException(
        'NOT_FOUND',
        'Firsat bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return opportunity;
  }

  /**
   * Interactions'daki M7 hatirlatma-catisma taramasiyla ayni algoritma (bkz.
   * interactions.service.ts) - kasitli olarak tekrar edildi, ortak bir yardimci
   * modul cikarmak bu kucuk mantik icin fazla soyutlama olurdu.
   */
  private async findReminderConflicts(
    assigneeUserIds: string[],
    startAt: Date,
  ): Promise<OpportunityReminderConflict[]> {
    const conflicts: OpportunityReminderConflict[] = [];
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
    dto: CreateOpportunityDto,
  ): Promise<CreateOpportunityResult> {
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

    const opportunityId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.opportunity.create({
        data: {
          tenantId,
          createdById,
          accountId: dto.accountId,
          name: dto.name,
          stage: dto.stage,
          estimatedValue: dto.estimatedValue,
          estimatedValueCurrency: dto.estimatedValueCurrency,
          description: dto.description,
          occurredAt: dto.occurredAt,
        } as never,
      });

      if (dto.reminder) {
        await tx.calendarEvent.create({
          data: {
            tenantId,
            createdById,
            title: dto.reminder.title ?? dto.name.slice(0, 60),
            startAt: dto.reminder.startAt,
            endAt: dto.reminder.startAt,
            relatedEntityType: 'Opportunity',
            relatedEntityId: created.id,
            attendees: { create: dto.reminder.assignees },
          },
        });
      }

      return created.id;
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'Opportunity',
      entityId: opportunityId,
    });

    return {
      opportunity: await this.getById(opportunityId),
      reminderConflicts,
    };
  }

  async update(id: string, dto: UpdateOpportunityDto): Promise<Opportunity> {
    await this.getById(id);
    const opportunity = await this.prisma.opportunity.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'Opportunity',
      entityId: id,
    });
    return opportunity;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.opportunity.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'Opportunity',
      entityId: id,
    });
  }
}
