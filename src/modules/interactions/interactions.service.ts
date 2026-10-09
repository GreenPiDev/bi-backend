import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Account,
  Contact,
  Interaction,
  InteractionParticipant,
  Opportunity,
} from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  findIdsBySql,
  qualifiedColumn,
  turkishContains,
} from '../../core/db/turkish-search';
import type { ExportFormat } from '../../core/export-format';
import { ListPdfService } from '../../core/pdf/list-pdf.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { isPastCalendarDay } from '../../core/validators/date';
import { rowsToXlsxBuffer } from '../../core/xlsx/xlsx-export.util';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AccountsCacheService } from '../accounts/accounts-cache.service';
import { normalizeAccountName } from '../accounts/account-name.util';
import { CalendarEventsCacheService } from '../calendar-events/calendar-events-cache.service';
import { CalendarEventsService } from '../calendar-events/calendar-events.service';
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
  performedByName: string | null;
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
    private readonly calendarEvents: CalendarEventsService,
    private readonly interactionsCache: InteractionsCacheService,
    private readonly opportunitiesCache: OpportunitiesCacheService,
    private readonly listPdf: ListPdfService,
  ) {}

  /** createdById/performedByUserId iliskisel bir FK degil (bkz. schema); isimler
   * gostermek icin User tablosundan toplu cozumleniyor. */
  private async attachCreatedByNames(
    rows: InteractionRow[],
  ): Promise<InteractionWithDetails[]> {
    const ids = [
      ...new Set(
        rows.flatMap((row) =>
          [row.createdById, row.performedByUserId].filter((id): id is string =>
            Boolean(id),
          ),
        ),
      ),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((user) => [user.id, user.name]));
    return rows.map((row) => ({
      ...row,
      createdByName: nameById.get(row.createdById) ?? null,
      performedByName: row.performedByUserId
        ? (nameById.get(row.performedByUserId) ?? null)
        : null,
    }));
  }

  /** Gorusme sekli, tenant'in tanimladigi listeye karsi dogrulanir - odeme yontemi
   * alaniyla ayni desen (bkz. QuotesService.assertValidPaymentMethod). Tenant henuz
   * hic gorusme sekli tanimlamadiysa serbest metin kabul edilir. */
  private async assertValidInteractionType(type: string): Promise<void> {
    const options = await this.prisma.interactionTypeOption.findMany();
    if (options.length === 0) {
      return;
    }
    if (!options.some((option) => option.label === type)) {
      throw new AppException(
        'INVALID_INTERACTION_TYPE',
        'Belirtilen gorusme sekli tanimli degil.',
        HttpStatus.BAD_REQUEST,
      );
    }
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
      q,
      accountId,
      contactId,
      createdById,
      type,
      status,
      from,
      to,
      parentInteractionId,
    } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'occurredAt',
      direction: 'desc',
    });

    // Postgres'in bu projede LC_CTYPE=C olmasi yuzunden `contains`/`mode: 'insensitive'`
    // Turkce aksanli karakterlerde (Ü, Ö, Ş, Ç, İ/ı) yanlis sonuc veriyor - bkz.
    // core/db/turkish-search.ts. Firma/kisi adi bir iliski uzerinden arandigindan JOIN'li
    // ham sorgu kuruluyor.
    const matchingIds = q
      ? await findIdsBySql(
          this.prisma,
          Prisma.sql`
            SELECT i."id" FROM "crm_interactions" i
            LEFT JOIN "crm_accounts" a ON a."id" = i."accountId"
            LEFT JOIN "crm_contacts" c ON c."id" = i."contactId"
            WHERE i."tenantId" = ${TenantContext.getOrThrow().tenantId}
              AND i."deletedAt" IS NULL
              AND (
                ${turkishContains(qualifiedColumn('a', 'name'), q)}
                OR ${turkishContains(qualifiedColumn('c', 'firstName'), q)}
                OR ${turkishContains(qualifiedColumn('c', 'lastName'), q)}
              )
          `,
        )
      : null;

    const where = {
      // "Bagli Gorusme Ekle" ile olusturulan ek kayitlar varsayilan olarak ana listede
      // gorunmez; sadece parentInteractionId acikca istendiginde (detay sayfasindaki
      // kartlar) gosterilir - bkz. schema.prisma Interaction.parentInteractionId yorumu.
      parentInteractionId: parentInteractionId ?? null,
      ...(matchingIds ? { id: { in: matchingIds } } : {}),
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
   * Kullanici istegiyle eklendi (accounts/contacts export'uyla ayni desen, bkz.
   * imports.service.ts) - ana listede uygulanan filtreleri degil, parent kaydi
   * olmayan (bagli gorusme degil) TUM gorusmeleri disa aktarir. Alanlar kullanicinin
   * istedigi 6 sutunla sinirli: firma, gorusulen kisi, bizden goruseni yapan kisi,
   * gorusme sekli, konu, tarih.
   */
  async exportInteractions(format: ExportFormat): Promise<Buffer> {
    const rows = await this.prisma.interaction.findMany({
      where: { parentInteractionId: null },
      orderBy: { occurredAt: 'desc' },
      include: INTERACTION_INCLUDE,
    });
    const withNames = await this.attachCreatedByNames(rows);
    const exportRows = withNames.map((row) => ({
      Firma: row.account?.name ?? '',
      'Görüşülen Kişi': row.contact
        ? `${row.contact.firstName} ${row.contact.lastName}`.trim()
        : '',
      'Görüşmeyi Yapan': row.performedByName ?? row.createdByName ?? '',
      'Görüşme Şekli': row.type,
      Konu: row.subject ?? '',
      Tarih: row.occurredAt.toLocaleDateString('tr-TR'),
    }));
    return format === 'pdf'
      ? this.listPdf.render('Görüşmeler', exportRows)
      : rowsToXlsxBuffer(exportRows, 'Görüşmeler');
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
    await this.assertValidInteractionType(dto.type);

    if (dto.reminder) {
      const assigneeIds = [
        ...new Set(dto.reminder.assignees.map((a) => a.userId)),
      ];
      const users = await this.prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true },
      });
      if (users.length !== assigneeIds.length) {
        throw new AppException(
          'USER_NOT_FOUND',
          'Atanan kullanicilardan biri bulunamadi.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const reminderConflicts = dto.reminder
      ? await this.findReminderConflicts(
          dto.reminder.assignees.map((a) => a.userId),
          dto.reminder.startAt,
        )
      : [];

    if (dto.parentInteractionId) {
      const parent = await this.prisma.interaction.findFirst({
        where: { id: dto.parentInteractionId },
      });
      if (!parent) {
        throw new AppException(
          'PARENT_INTERACTION_NOT_FOUND',
          'Bagli olunacak gorusme bulunamadi.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (dto.performedByUserId) {
      const performer = await this.prisma.user.findFirst({
        where: { id: dto.performedByUserId },
      });
      if (!performer) {
        throw new AppException(
          'USER_NOT_FOUND',
          'Secilen kullanici bulunamadi.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    let accountWasCreated = false;
    const { interactionId, reminderEvent } = await this.prisma.$transaction(
      async (tx) => {
        let accountId = dto.accountId;
        let accountAutoCreated = false;
        if (accountId) {
          const account = await tx.account.findFirst({
            where: { id: accountId },
          });
          if (!account) {
            throw new AppException(
              'ACCOUNT_NOT_FOUND',
              'Secilen firma bulunamadi.',
              HttpStatus.BAD_REQUEST,
            );
          }
        } else if (dto.accountName) {
          const account = await tx.account.create({
            data: {
              name: normalizeAccountName(dto.accountName),
              createdById,
            } as never,
          });
          accountId = account.id;
          accountAutoCreated = true;
          accountWasCreated = true;
        }

        let contactId = dto.contactId;
        let contactAutoCreated = false;
        let contactLastContactedAt: Date | null = null;
        if (contactId) {
          // findUnique tenant-scoped extension'in kapsami disindadir (bkz.
          // tenant-scoped.extension.ts) - burada bilerek findFirst kullaniliyor.
          const contact = await tx.contact.findFirst({
            where: { id: contactId },
          });
          if (!contact) {
            throw new AppException(
              'CONTACT_NOT_FOUND',
              'Secilen kisi bulunamadi.',
              HttpStatus.BAD_REQUEST,
            );
          }
          if (!accountId) {
            accountId = contact.accountId ?? undefined;
          }
          contactLastContactedAt = contact.lastContactedAt;
        } else if (dto.contactName) {
          const { firstName, lastName } = splitFreeTextName(dto.contactName);
          const contact = await tx.contact.create({
            data: { accountId, firstName, lastName, createdById } as never,
          });
          contactId = contact.id;
          contactAutoCreated = true;
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
            subject: dto.subject,
            notes: dto.notes,
            occurredAt: dto.occurredAt,
            accountAutoCreated,
            contactAutoCreated,
            parentInteractionId: dto.parentInteractionId,
            performedByUserId: dto.performedByUserId,
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

        // K2: gorusme kaydi, kisinin "en son iletisim" tarihini otomatik ileri
        // tasir - kullanicinin /kisiler/:id'den elle guncellemesine ek olarak
        // (bkz. ContactsService.update). Gecmis tarihli bir gorusme, o kisinin
        // hali hazirda daha yeni bir lastContactedAt'ini geriye almaz.
        if (
          contactId &&
          (!contactLastContactedAt || contactLastContactedAt < dto.occurredAt)
        ) {
          await tx.contact.update({
            where: { id: contactId },
            data: {
              lastContactedAt: dto.occurredAt,
              inactivityNotifiedAt: null,
            },
          });
        }

        let reminderEvent: {
          id: string;
          title: string;
          createdById: string;
          attendees: { userId: string; status: string }[];
        } | null = null;
        if (dto.reminder) {
          // Ad-hoc (2026-09-29): katilimci artik otomatik eklenmiyor (bkz.
          // CalendarEventsService) - atanan kisi kendisi degilse PENDING olarak
          // yaratilir, transaction sonrasi davet bildirimi gonderilir.
          const attendeesData = dto.reminder.assignees.map((assignee) =>
            assignee.userId === createdById
              ? {
                  ...assignee,
                  status: 'ACCEPTED' as const,
                  respondedAt: new Date(),
                }
              : { ...assignee, status: 'PENDING' as const },
          );
          reminderEvent = await tx.calendarEvent.create({
            data: {
              tenantId,
              createdById,
              title: dto.reminder.title,
              description: dto.reminder.description,
              startAt: dto.reminder.startAt,
              endAt: dto.reminder.startAt,
              relatedEntityType: 'Interaction',
              relatedEntityId: created.id,
              attendees: { create: attendeesData },
            },
            include: { attendees: true },
          });
        }

        return { interactionId: created.id, reminderEvent };
      },
    );

    await this.audit.log({
      action: 'CREATE',
      entity: 'Interaction',
      entityId: interactionId,
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

    if (reminderEvent) {
      const pending = reminderEvent.attendees.filter(
        (a) => a.status === 'PENDING',
      );
      await this.calendarEvents.notifyInvitedAttendees(
        tenantId,
        reminderEvent,
        pending,
      );
    }

    return {
      interaction: await this.getById(interactionId),
      reminderConflicts,
    };
  }

  async update(
    id: string,
    dto: UpdateInteractionDto,
  ): Promise<InteractionWithDetails> {
    await this.getById(id);
    if (dto.type) {
      await this.assertValidInteractionType(dto.type);
    }
    if (dto.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: dto.contactId },
      });
      if (!contact) {
        throw new AppException(
          'CONTACT_NOT_FOUND',
          'Secilen kisi bulunamadi.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    if (dto.performedByUserId) {
      const performer = await this.prisma.user.findFirst({
        where: { id: dto.performedByUserId },
      });
      if (!performer) {
        throw new AppException(
          'USER_NOT_FOUND',
          'Secilen kullanici bulunamadi.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const { participants, ...rest } = dto;
    await this.prisma.$transaction(async (tx) => {
      await tx.interaction.update({ where: { id }, data: rest });
      if (participants) {
        await tx.interactionParticipant.deleteMany({
          where: { interactionId: id },
        });
        if (participants.length > 0) {
          await tx.interactionParticipant.createMany({
            data: participants.map((participant) => ({
              ...participant,
              interactionId: id,
            })),
          });
        }
      }
    });
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
