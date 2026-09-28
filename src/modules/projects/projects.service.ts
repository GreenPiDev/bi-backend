import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Project, Quote } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import { ProjectsCacheService } from './projects-cache.service';
import type {
  CreateProjectDto,
  ProjectQueryDto,
  UpdateProjectDto,
} from './dto/project.dto';

const SORTABLE_FIELDS = ['projectNumber', 'name', 'createdAt'] as const;
const PROJECT_NUMBER_CREATE_RETRIES = 5;

const PROJECT_INCLUDE = { quotes: true } as const;

export type ProjectWithQuotes = Project & { quotes: Quote[] };

function projectNumberPrefix(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `PRJ-${yyyy}-${mm}-${dd}-`;
}

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly cache: ProjectsCacheService,
  ) {}

  async list(query: ProjectQueryDto): Promise<PagedResult<Project>> {
    const cached = await this.cache.get(query);
    if (cached) {
      return cached;
    }

    const { page, pageSize, accountId } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    const where = {
      ...(accountId ? { accountId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
      }),
      this.prisma.project.count({ where }),
    ]);

    const result = {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
    await this.cache.set(query, result);
    return result;
  }

  async getById(id: string): Promise<ProjectWithQuotes> {
    const project = await this.prisma.project.findFirst({
      where: { id },
      include: PROJECT_INCLUDE,
    });
    if (!project) {
      throw new AppException(
        'NOT_FOUND',
        'Proje bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return project;
  }

  /**
   * Proje duzenleme formundaki cok-secimli "Teklifler" alani icin: her teklif (a)
   * var olmali, (b) projenin firmasina ait olmali, (c) baska bir projeye zaten
   * bagli olmamali (bloklayici tasarim - kullanici once o teklifi diger projeden
   * cikarmali).
   */
  private async assertQuotesAssignable(
    quoteIds: string[],
    accountId: string,
    projectId: string,
  ): Promise<void> {
    if (quoteIds.length === 0) {
      return;
    }
    const quotes = await this.prisma.quote.findMany({
      where: { id: { in: quoteIds } },
    });
    if (quotes.length !== new Set(quoteIds).size) {
      throw new AppException(
        'QUOTE_NOT_FOUND',
        'Secilen tekliflerden biri bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    for (const quote of quotes) {
      if (quote.accountId !== accountId) {
        throw new AppException(
          'QUOTE_ACCOUNT_MISMATCH',
          'Secilen tekliflerden biri bu firmaya ait degil.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (quote.projectId && quote.projectId !== projectId) {
        throw new AppException(
          'QUOTE_ALREADY_LINKED_TO_PROJECT',
          'Secilen tekliflerden biri baska bir projeye zaten bagli.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  /**
   * Gunluk sira sayacinin taban sorgusu. `count()` yerine ham SQL kullaniyor:
   * tenant-scoped extension SOFT_DELETE_MODELS icin okuma sorgularina
   * otomatik `deletedAt: null` ekliyor, ama `projectNumber` unique kisiti
   * (`@@unique([tenantId, projectNumber])`) soft-delete'li satirlari da
   * kapsiyor. Silinmis bir proje ayni gun-ici numarayi hala isgal ediyorken
   * sayac onu gormezden gelip ayni numarayi tekrar uretirse `P2002` olusur
   * (quotes.service.ts'teki ayni sinif hatanin projects karsiligi).
   */
  private async countProjectNumbersForPrefix(prefix: string): Promise<number> {
    const { tenantId } = TenantContext.getOrThrow();
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM crm_projects
      WHERE "tenantId" = ${tenantId}
        AND "projectNumber" LIKE ${prefix + '%'}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async create(
    createdById: string,
    dto: CreateProjectDto,
  ): Promise<ProjectWithQuotes> {
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId },
    });
    if (!account) {
      throw new AppException(
        'ACCOUNT_NOT_FOUND',
        'Secilen firma bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }

    let created: Project | undefined;
    for (
      let attempt = 0;
      attempt < PROJECT_NUMBER_CREATE_RETRIES;
      attempt += 1
    ) {
      const prefix = projectNumberPrefix(new Date());
      const countToday = await this.countProjectNumbersForPrefix(prefix);
      const projectNumber = `${prefix}${String(countToday + 1).padStart(3, '0')}`;
      try {
        created = await this.prisma.project.create({
          data: { ...dto, projectNumber, createdById } as never,
        });
        break;
      } catch (error) {
        const isDuplicateNumber =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          (error.meta?.target as string[] | undefined)?.includes(
            'projectNumber',
          );
        if (
          !isDuplicateNumber ||
          attempt === PROJECT_NUMBER_CREATE_RETRIES - 1
        ) {
          throw error;
        }
      }
    }
    if (!created) {
      throw new AppException(
        'PROJECT_NUMBER_CONFLICT',
        'Proje numarasi olusturulamadi, lutfen tekrar deneyin.',
        HttpStatus.CONFLICT,
      );
    }

    await this.audit.log({
      action: 'CREATE',
      entity: 'Project',
      entityId: created.id,
      meta: { projectNumber: created.projectNumber },
    });
    await this.cache.invalidate();
    return this.getById(created.id);
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectWithQuotes> {
    const project = await this.getById(id);
    const { quoteIds, ...fields } = dto;
    if (quoteIds !== undefined) {
      await this.assertQuotesAssignable(quoteIds, project.accountId, id);
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(fields).length > 0) {
        await tx.project.update({ where: { id }, data: fields });
      }
      if (quoteIds !== undefined) {
        await tx.quote.updateMany({
          where: { projectId: id },
          data: { projectId: null },
        });
        if (quoteIds.length > 0) {
          await tx.quote.updateMany({
            where: { id: { in: quoteIds } },
            data: { projectId: id },
          });
        }
      }
    });

    await this.audit.log({
      action: 'UPDATE',
      entity: 'Project',
      entityId: id,
    });
    await this.cache.invalidate();
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.project.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'Project',
      entityId: id,
    });
    await this.cache.invalidate();
  }
}
