import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Project } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  CreateProjectDto,
  ProjectQueryDto,
  UpdateProjectDto,
} from './dto/project.dto';

const SORTABLE_FIELDS = ['projectNumber', 'name', 'createdAt'] as const;
const PROJECT_NUMBER_CREATE_RETRIES = 5;

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
  ) {}

  async list(query: ProjectQueryDto): Promise<PagedResult<Project>> {
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

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({ where: { id } });
    if (!project) {
      throw new AppException(
        'NOT_FOUND',
        'Proje bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return project;
  }

  /** P2: quoteId verilirse, o teklif ayni firmaya ait olmali (Quotes'daki
   * contactId/accountId eslesme kontrolu ile ayni desen). */
  private async assertQuoteMatchesAccount(
    quoteId: string,
    accountId: string,
  ): Promise<void> {
    const quote = await this.prisma.quote.findFirst({ where: { id: quoteId } });
    if (!quote || quote.accountId !== accountId) {
      throw new AppException(
        'QUOTE_ACCOUNT_MISMATCH',
        'Secilen teklif bu firmaya ait degil.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async create(createdById: string, dto: CreateProjectDto): Promise<Project> {
    if (dto.quoteId) {
      await this.assertQuoteMatchesAccount(dto.quoteId, dto.accountId);
    }

    let created: Project | undefined;
    for (
      let attempt = 0;
      attempt < PROJECT_NUMBER_CREATE_RETRIES;
      attempt += 1
    ) {
      const prefix = projectNumberPrefix(new Date());
      const countToday = await this.prisma.project.count({
        where: { projectNumber: { startsWith: prefix } },
      });
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
    return created;
  }

  async update(id: string, dto: UpdateProjectDto): Promise<Project> {
    await this.getById(id);
    const project = await this.prisma.project.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'Project',
      entityId: id,
    });
    return project;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.project.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'Project',
      entityId: id,
    });
  }
}
