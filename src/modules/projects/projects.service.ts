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

const PROJECT_INCLUDE = { quotes: true, responsibles: true } as const;

export type ProjectResponsibleUser = { id: string; name: string };

export type ProjectWithQuotes = Project & {
  quotes: Quote[];
  responsibleUsers: ProjectResponsibleUser[];
};

export type ProjectListItem = Project & {
  responsibleUsers: ProjectResponsibleUser[];
};

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

  async list(query: ProjectQueryDto): Promise<PagedResult<ProjectListItem>> {
    const cached = await this.cache.get<ProjectListItem>(query);
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
      data: await this.attachResponsibleUsers(data),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
    await this.cache.set(query, result);
    return result;
  }

  /**
   * Birden fazla projenin "bizden ilgili" kullanicilarini tek seferde cozer (liste
   * sayfasi icin N+1 sorgu yerine 2 toplu sorgu) - CalendarEventsService'in
   * attendeeName cozumlemesiyle ayni desen.
   */
  private async attachResponsibleUsers(
    projects: Project[],
  ): Promise<ProjectListItem[]> {
    if (projects.length === 0) {
      return [];
    }
    const rows = await this.prisma.projectResponsible.findMany({
      where: { projectId: { in: projects.map((p) => p.id) } },
    });
    const nameById = await this.resolveUserNames(rows.map((r) => r.userId));
    const byProject = new Map<string, ProjectResponsibleUser[]>();
    for (const row of rows) {
      const list = byProject.get(row.projectId) ?? [];
      list.push({
        id: row.userId,
        name: nameById.get(row.userId) ?? 'Bir kullanici',
      });
      byProject.set(row.projectId, list);
    }
    return projects.map((project) => ({
      ...project,
      responsibleUsers: byProject.get(project.id) ?? [],
    }));
  }

  private async resolveUserNames(
    userIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true },
    });
    return new Map(users.map((user) => [user.id, user.name]));
  }

  /**
   * Proje duzenleme/olusturma formundaki "Bizden ilgili" cok-secimli alani icin
   * secilebilir kullanici listesi - CalendarEventsService.listAssignableUsers ile
   * ayni filtre (aktif, platform admin olmayan kullanicilar).
   */
  async listAssignableUsers(): Promise<{ id: string; name: string }[]> {
    return this.prisma.user.findMany({
      where: { isActive: true, isPlatformAdmin: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * "Bizden ilgili" alaninda secilen kullanicilarin hepsinin (tenant icinde) var
   * oldugunu dogrular - assertQuotesAssignable ile ayni amac.
   */
  private async assertResponsibleUsersExist(userIds: string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
    });
    if (users.length !== new Set(userIds).size) {
      throw new AppException(
        'USER_NOT_FOUND',
        'Secilen kullanicilardan biri bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * `idOrNumber` ikisinden biri olabilir: gercek UUID `id` (detay sayfasi,
   * ic cagrilar) veya `projectNumber` (frontend duzenleme rotasi artik
   * `/projeler/duzenle/:projectNumber` - bkz. App.tsx). Ikisi de tenant
   * basina unique oldugu icin OR ile tek sorguda cozuluyor.
   */
  async getById(idOrNumber: string): Promise<ProjectWithQuotes> {
    const project = await this.prisma.project.findFirst({
      where: { OR: [{ id: idOrNumber }, { projectNumber: idOrNumber }] },
      include: PROJECT_INCLUDE,
    });
    if (!project) {
      throw new AppException(
        'NOT_FOUND',
        'Proje bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const { responsibles, ...rest } = project;
    const nameById = await this.resolveUserNames(
      (responsibles ?? []).map((r) => r.userId),
    );
    const responsibleUsers = (responsibles ?? []).map((r) => ({
      id: r.userId,
      name: nameById.get(r.userId) ?? 'Bir kullanici',
    }));
    return { ...rest, responsibleUsers };
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

    const { responsibleUserIds, ...projectFields } = dto;
    if (responsibleUserIds) {
      await this.assertResponsibleUsersExist(responsibleUserIds);
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
          data: { ...projectFields, projectNumber, createdById } as never,
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

    if (responsibleUserIds && responsibleUserIds.length > 0) {
      await this.prisma.projectResponsible.createMany({
        data: responsibleUserIds.map((userId) => ({
          projectId: created.id,
          userId,
        })),
      });
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
    const { quoteIds, responsibleUserIds, ...fields } = dto;
    if (quoteIds !== undefined) {
      await this.assertQuotesAssignable(quoteIds, project.accountId, id);
    }
    if (responsibleUserIds !== undefined) {
      await this.assertResponsibleUsersExist(responsibleUserIds);
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
      if (responsibleUserIds !== undefined) {
        await tx.projectResponsible.deleteMany({ where: { projectId: id } });
        if (responsibleUserIds.length > 0) {
          await tx.projectResponsible.createMany({
            data: responsibleUserIds.map((userId) => ({
              projectId: id,
              userId,
            })),
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
