import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  Survey,
  SurveyQuestion,
  SurveyQuestionOption,
} from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { findIdsByTurkishSearch } from '../../core/db/turkish-search';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  CreateSurveyDto,
  SurveyQueryDto,
  UpdateSurveyDto,
} from './dto/survey.dto';

const SORTABLE_FIELDS = ['name', 'createdAt'] as const;

export type SurveyQuestionWithOptions = SurveyQuestion & {
  options: SurveyQuestionOption[];
};

export type SurveyWithQuestions = Survey & {
  questions: SurveyQuestionWithOptions[];
};

const SURVEY_INCLUDE = {
  questions: {
    orderBy: { ordinal: 'asc' as const },
    include: { options: { orderBy: { ordinal: 'asc' as const } } },
  },
} as const;

/**
 * Anket sablonlari - /satis-sonrasi?tab=surveys (kullanici talebi, 2026-10-20
 * genislemesi). Sorular/secenekler her guncellemede tumden-degistir (replace-all)
 * stratejisiyle yazilir - quotes.service.ts'teki QuoteItem replace-all deseniyle
 * ayni ruh (bkz. CLAUDE.md SS13).
 */
@Injectable()
export class SurveysService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(query: SurveyQueryDto): Promise<PagedResult<SurveyWithQuestions>> {
    const { page, pageSize, q } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'name',
      direction: 'asc',
    });

    const matchingIds = q
      ? await findIdsByTurkishSearch(this.prisma, 'crm_surveys', ['name'], q)
      : null;

    const where = {
      ...(matchingIds ? { id: { in: matchingIds } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.survey.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        include: SURVEY_INCLUDE,
      }),
      this.prisma.survey.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string): Promise<SurveyWithQuestions> {
    const survey = await this.prisma.survey.findFirst({
      where: { id },
      include: SURVEY_INCLUDE,
    });
    if (!survey) {
      throw new AppException(
        'NOT_FOUND',
        'Anket bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return survey;
  }

  /** Aktif anketler - gonderim ekranindaki secici icin (silinmis/pasif haric). */
  async listActive(): Promise<Survey[]> {
    return this.prisma.survey.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(
    userId: string,
    dto: CreateSurveyDto,
  ): Promise<SurveyWithQuestions> {
    const { tenantId } = TenantContext.getOrThrow();
    const survey = await this.prisma.survey.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive ?? true,
        createdById: userId,
        questions: {
          create: dto.questions.map((question, index) => ({
            type: question.type,
            text: question.text,
            required: question.required ?? true,
            ordinal: index,
            options:
              question.type === 'MULTIPLE_CHOICE'
                ? {
                    create: (question.options ?? []).map(
                      (option, optionIndex) => ({
                        label: option.label,
                        ordinal: optionIndex,
                      }),
                    ),
                  }
                : undefined,
          })),
        },
      },
      include: SURVEY_INCLUDE,
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'Survey',
      entityId: survey.id,
    });

    return survey;
  }

  async update(id: string, dto: UpdateSurveyDto): Promise<SurveyWithQuestions> {
    await this.getById(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.survey.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          isActive: dto.isActive,
        },
      });

      if (dto.questions) {
        await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
        for (const [index, question] of dto.questions.entries()) {
          await tx.surveyQuestion.create({
            data: {
              surveyId: id,
              type: question.type,
              text: question.text,
              required: question.required ?? true,
              ordinal: index,
              options:
                question.type === 'MULTIPLE_CHOICE'
                  ? {
                      create: (question.options ?? []).map(
                        (option, optionIndex) => ({
                          label: option.label,
                          ordinal: optionIndex,
                        }),
                      ),
                    }
                  : undefined,
            },
          });
        }
      }
    });

    await this.audit.log({ action: 'UPDATE', entity: 'Survey', entityId: id });

    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.survey.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'Survey', entityId: id });
  }
}
