import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Account,
  Contact,
  FeedbackSurvey,
  PostSaleCase,
  PostSaleFeedbackNote,
  Quote,
  SalesOrder,
  SurveyQuestion,
  SurveyQuestionOption,
  SurveyResponse,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { AppException } from '../../core/errors/app.exception';
import {
  findIdsBySql,
  qualifiedColumn,
  turkishContains,
} from '../../core/db/turkish-search';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import { TenantContext } from '../../core/tenant/tenant-context';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import {
  POST_SALE_SURVEY_QUEUE,
  SEND_POST_SALE_SURVEY_JOB,
} from '../../jobs/post-sale-survey-queue.constants';
import { AuditService } from '../audit/audit.service';
import { PostSaleCasesCacheService } from './post-sale-cases-cache.service';
import type {
  MarkPostSaleFeedbackDto,
  PostSaleCaseQueryDto,
  PostSaleCaseStatus,
  PostSaleFeedbackNoteDto,
  SendPostSaleSurveyDto,
} from './dto/post-sale-case.dto';

const SORTABLE_FIELDS = ['reminderAt', 'createdAt'] as const;

const POST_SALE_CASE_INCLUDE = {
  salesOrder: true,
  quote: true,
  account: true,
  contact: true,
  feedbackNotes: { orderBy: { createdAt: 'asc' as const } },
  feedbackSurvey: {
    include: {
      responses: {
        orderBy: { question: { ordinal: 'asc' as const } },
        include: { question: true, answerOption: true },
      },
    },
  },
} as const;

export type SurveyResponseWithQuestion = SurveyResponse & {
  question: SurveyQuestion;
  answerOption: SurveyQuestionOption | null;
};

export type PostSaleCaseWithDetails = PostSaleCase & {
  salesOrder: SalesOrder;
  quote: Quote | null;
  account: Account;
  contact: Contact | null;
  feedbackNotes: PostSaleFeedbackNote[];
  feedbackSurvey:
    (FeedbackSurvey & { responses: SurveyResponseWithQuestion[] }) | null;
  status: PostSaleCaseStatus;
};

function computeStatus(postSaleCase: {
  reminderSentAt: Date | null;
  feedbackReceivedAt: Date | null;
}): PostSaleCaseStatus {
  if (postSaleCase.feedbackReceivedAt) {
    return 'GERI_BILDIRIM_ALINDI';
  }
  if (postSaleCase.reminderSentAt) {
    return 'HATIRLATILDI';
  }
  return 'BEKLEMEDE';
}

const STATUS_WHERE: Record<PostSaleCaseStatus, Record<string, unknown>> = {
  BEKLEMEDE: { reminderSentAt: null, feedbackReceivedAt: null },
  HATIRLATILDI: { reminderSentAt: { not: null }, feedbackReceivedAt: null },
  GERI_BILDIRIM_ALINDI: { feedbackReceivedAt: { not: null } },
};

@Injectable()
export class PostSaleCasesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    @InjectQueue(POST_SALE_SURVEY_QUEUE)
    private readonly surveyQueue: Queue,
    private readonly cache: PostSaleCasesCacheService,
  ) {}

  async list(
    query: PostSaleCaseQueryDto,
  ): Promise<PagedResult<PostSaleCaseWithDetails>> {
    const cached = await this.cache.get(query);
    if (cached) {
      return cached;
    }

    const { page, pageSize, accountId, status, q, from, to } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    // Postgres'in bu projede LC_CTYPE=C olmasi yuzunden `contains`/`mode: 'insensitive'`
    // Turkce aksanli karakterlerde (Ü, Ö, Ş, Ç, İ/ı) yanlis sonuc veriyor - bkz.
    // core/db/turkish-search.ts.
    const matchingIds = q
      ? await findIdsBySql(
          this.prisma,
          Prisma.sql`
            SELECT p."id" FROM "crm_post_sale_cases" p
            LEFT JOIN "crm_sales_orders" so ON so."id" = p."salesOrderId"
            LEFT JOIN "crm_quotes" qt ON qt."id" = p."quoteId"
            LEFT JOIN "crm_accounts" a ON a."id" = p."accountId"
            LEFT JOIN "crm_contacts" c ON c."id" = p."contactId"
            WHERE p."tenantId" = ${TenantContext.getOrThrow().tenantId}
              AND (
                ${turkishContains(qualifiedColumn('so', 'orderNumber'), q)}
                OR ${turkishContains(qualifiedColumn('qt', 'quoteNumber'), q)}
                OR ${turkishContains(qualifiedColumn('a', 'name'), q)}
                OR ${turkishContains(qualifiedColumn('c', 'firstName'), q)}
                OR ${turkishContains(qualifiedColumn('c', 'lastName'), q)}
              )
          `,
        )
      : null;

    const where = {
      ...(matchingIds ? { id: { in: matchingIds } } : {}),
      ...(accountId ? { accountId } : {}),
      ...(status ? STATUS_WHERE[status] : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.postSaleCase.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        include: POST_SALE_CASE_INCLUDE,
      }),
      this.prisma.postSaleCase.count({ where }),
    ]);

    const result = {
      data: data.map((row) => ({ ...row, status: computeStatus(row) })),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
    await this.cache.set(query, result);
    return result;
  }

  async getById(id: string): Promise<PostSaleCaseWithDetails> {
    const postSaleCase = await this.prisma.postSaleCase.findFirst({
      where: { id },
      include: POST_SALE_CASE_INCLUDE,
    });
    if (!postSaleCase) {
      throw new AppException(
        'NOT_FOUND',
        'Satis sonrasi kaydi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return { ...postSaleCase, status: computeStatus(postSaleCase) };
  }

  /** S3 (2026-10-20 revizyonu): her gonderimde hangi Survey sablonu + kime (kisi
   * secilerek veya elle ad/mail girilerek) gonderilecegi acikca belirtilir. CONTACT
   * modunda secilen kisinin bu firmaya ait oldugu dogrulanir, ama Contact.email
   * degistirilmez - recipientEmail bu gonderime ozel, kullanici tarafindan
   * duzenlenebilir bir kopyadir. */
  async sendSurvey(
    id: string,
    dto: SendPostSaleSurveyDto,
  ): Promise<PostSaleCaseWithDetails> {
    const existing = await this.getById(id);

    const survey = await this.prisma.survey.findFirst({
      where: { id: dto.surveyId, isActive: true },
    });
    if (!survey) {
      throw new AppException(
        'SURVEY_NOT_FOUND',
        'Secilen anket bulunamadi veya pasif.',
        HttpStatus.BAD_REQUEST,
      );
    }

    let contactId: string | null = null;
    if (dto.recipientKind === 'CONTACT') {
      const contact = await this.prisma.contact.findFirst({
        where: { id: dto.contactId },
      });
      if (!contact || contact.accountId !== existing.accountId) {
        throw new AppException(
          'CONTACT_ACCOUNT_MISMATCH',
          'Secilen kisi bu firmaya ait degil.',
          HttpStatus.BAD_REQUEST,
        );
      }
      contactId = contact.id;
    }

    await this.surveyQueue.add(SEND_POST_SALE_SURVEY_JOB, {
      postSaleCaseId: id,
      surveyId: dto.surveyId,
      recipientKind: dto.recipientKind,
      contactId,
      recipientName: dto.recipientName,
      recipientEmail: dto.recipientEmail,
      fromEmail: dto.fromEmail ?? null,
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'PostSaleCase',
      entityId: id,
      meta: { action: 'send-survey', surveyId: dto.surveyId },
    });
    await this.cache.invalidate();

    return this.getById(id);
  }

  async markFeedback(
    id: string,
    dto: MarkPostSaleFeedbackDto,
  ): Promise<PostSaleCaseWithDetails> {
    const existing = await this.getById(id);
    // Ilk geri bildirim tarihi korunur: sonraki her not "geri bildirim alindi"
    // tarihini ileri kaydirmamali (Surec kartindaki zaman cizelgesi bunu gosterir).
    const feedbackReceivedAt = existing.feedbackReceivedAt ?? new Date();

    await this.prisma.postSaleCase.update({
      where: { id },
      data: { feedbackReceivedAt },
    });

    if (dto.responseNote) {
      await this.prisma.postSaleFeedbackNote.create({
        data: {
          tenantId: existing.tenantId,
          postSaleCaseId: id,
          text: dto.responseNote,
        },
      });
    }

    if (existing.feedbackSurvey) {
      await this.prisma.feedbackSurvey.update({
        where: { id: existing.feedbackSurvey.id },
        data: {
          respondedAt:
            existing.feedbackSurvey.respondedAt ?? feedbackReceivedAt,
          responseNote:
            dto.responseNote ?? existing.feedbackSurvey.responseNote,
        },
      });
    }

    await this.audit.log({
      action: 'UPDATE',
      entity: 'PostSaleCase',
      entityId: id,
      meta: { action: 'mark-feedback' },
    });
    await this.cache.invalidate();

    return this.getById(id);
  }

  async updateFeedbackNote(
    id: string,
    noteId: string,
    dto: PostSaleFeedbackNoteDto,
  ): Promise<PostSaleCaseWithDetails> {
    await this.findNoteOrThrow(id, noteId);
    await this.prisma.postSaleFeedbackNote.update({
      where: { id: noteId },
      data: { text: dto.text },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'PostSaleCase',
      entityId: id,
      meta: { action: 'update-feedback-note', noteId },
    });
    await this.cache.invalidate();
    return this.getById(id);
  }

  async deleteFeedbackNote(
    id: string,
    noteId: string,
  ): Promise<PostSaleCaseWithDetails> {
    await this.findNoteOrThrow(id, noteId);
    await this.prisma.postSaleFeedbackNote.delete({ where: { id: noteId } });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'PostSaleCase',
      entityId: id,
      meta: { action: 'delete-feedback-note', noteId },
    });
    await this.cache.invalidate();
    return this.getById(id);
  }

  /** Not yoksa, baska bir kayda veya baska bir tenant'a aitse 404 (varligi sizdirma). */
  private async findNoteOrThrow(
    id: string,
    noteId: string,
  ): Promise<PostSaleFeedbackNote> {
    await this.getById(id);
    const note = await this.prisma.postSaleFeedbackNote.findFirst({
      where: { id: noteId, postSaleCaseId: id },
    });
    if (!note) {
      throw new AppException(
        'FEEDBACK_NOTE_NOT_FOUND',
        'Not bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return note;
  }
}
