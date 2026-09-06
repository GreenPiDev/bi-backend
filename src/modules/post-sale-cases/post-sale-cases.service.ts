import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  Account,
  Contact,
  FeedbackSurvey,
  PostSaleCase,
  Quote,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import {
  POST_SALE_SURVEY_QUEUE,
  SEND_POST_SALE_SURVEY_JOB,
} from '../../jobs/post-sale-survey-queue.constants';
import { AuditService } from '../audit/audit.service';
import type {
  MarkPostSaleFeedbackDto,
  PostSaleCaseQueryDto,
  PostSaleCaseStatus,
  SendPostSaleSurveyDto,
} from './dto/post-sale-case.dto';

const SORTABLE_FIELDS = ['reminderAt', 'createdAt'] as const;

const POST_SALE_CASE_INCLUDE = {
  quote: true,
  account: true,
  contact: true,
  feedbackSurvey: true,
} as const;

export type PostSaleCaseWithDetails = PostSaleCase & {
  quote: Quote;
  account: Account;
  contact: Contact | null;
  feedbackSurvey: FeedbackSurvey | null;
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
  ) {}

  async list(
    query: PostSaleCaseQueryDto,
  ): Promise<PagedResult<PostSaleCaseWithDetails>> {
    const { page, pageSize, accountId, status } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'reminderAt',
      direction: 'asc',
    });

    const where = {
      ...(accountId ? { accountId } : {}),
      ...(status ? STATUS_WHERE[status] : {}),
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

    return {
      data: data.map((row) => ({ ...row, status: computeStatus(row) })),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
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

  /** S3: case'de contactId zaten varsa (otomatik doldurulmus veya daha once elle
   * secilmis) resend sayilir; yoksa dto.contactId zorunludur ve hesaba ait olmalidir. */
  async sendSurvey(
    id: string,
    dto: SendPostSaleSurveyDto,
  ): Promise<PostSaleCaseWithDetails> {
    const existing = await this.getById(id);
    const contactId = existing.contactId ?? dto.contactId;
    if (!contactId) {
      throw new AppException(
        'CONTACT_REQUIRED',
        'Anket gonderebilmek icin bir kisi secilmelidir.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!existing.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: contactId },
      });
      if (!contact || contact.accountId !== existing.accountId) {
        throw new AppException(
          'CONTACT_ACCOUNT_MISMATCH',
          'Secilen kisi bu firmaya ait degil.',
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.prisma.postSaleCase.update({
        where: { id },
        data: { contactId },
      });
    }

    await this.surveyQueue.add(SEND_POST_SALE_SURVEY_JOB, {
      postSaleCaseId: id,
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'PostSaleCase',
      entityId: id,
      meta: { action: 'send-survey' },
    });

    return this.getById(id);
  }

  async markFeedback(
    id: string,
    dto: MarkPostSaleFeedbackDto,
  ): Promise<PostSaleCaseWithDetails> {
    const existing = await this.getById(id);
    const feedbackReceivedAt = new Date();

    await this.prisma.postSaleCase.update({
      where: { id },
      data: {
        feedbackReceivedAt,
        feedbackNote: dto.responseNote ?? existing.feedbackNote,
      },
    });

    if (existing.feedbackSurvey) {
      await this.prisma.feedbackSurvey.update({
        where: { id: existing.feedbackSurvey.id },
        data: {
          respondedAt: feedbackReceivedAt,
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

    return this.getById(id);
  }
}
