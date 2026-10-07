import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  Project,
  ProjectAttachment,
  Quote,
  QuoteItem,
} from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  findIdsBySql,
  qualifiedColumn,
  turkishContains,
} from '../../core/db/turkish-search';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import { FileUrlService } from '../../core/storage/file-url.service';
import { R2StorageService } from '../../core/storage/r2-storage.service';
import { detectAttachmentExtension } from '../../core/validators/attachment-upload-validation';
import { AuditService } from '../audit/audit.service';
import { ProjectsCacheService } from './projects-cache.service';
import type {
  CreateProjectDto,
  ProjectQueryDto,
  UpdateProjectDto,
} from './dto/project.dto';

const SORTABLE_FIELDS = ['projectNumber', 'name', 'createdAt'] as const;
const PROJECT_NUMBER_CREATE_RETRIES = 5;
export const MAX_PROJECT_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_PROJECT_ATTACHMENTS_PER_PROJECT = 10;

const PROJECT_INCLUDE = {
  // items: genel toplam goruntulenebilsin diye (bkz. project-detail-page.tsx
  // quoteGrandTotalDisplay) - MANUAL_TOTAL tekliflerde bos kalir, ITEMIZED'de gerekli.
  quotes: { include: { items: true } },
  responsibles: true,
  attachments: true,
} as const;

export type ProjectResponsibleUser = { id: string; name: string };

export interface ProjectAttachmentView {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string | null;
  createdAt: Date;
}

export type ProjectWithQuotes = Project & {
  quotes: (Quote & { items: QuoteItem[] })[];
  responsibleUsers: ProjectResponsibleUser[];
  attachments: ProjectAttachmentView[];
};

export type ProjectListItem = Project & {
  responsibleUsers: ProjectResponsibleUser[];
  accountName: string;
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
    private readonly fileUrl: FileUrlService,
    private readonly storage: R2StorageService,
  ) {}

  private mapAttachment(attachment: ProjectAttachment): ProjectAttachmentView {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      url: this.fileUrl.build(
        attachment.fileKey,
        attachment.createdAt,
        attachment.fileName,
      ),
      createdAt: attachment.createdAt,
    };
  }

  /** Hem "Yeni Proje" (proje olusturulduktan hemen sonra) hem "Duzenle" sayfasindan
   * cagrilir - dosya secimi aninda degil, form "Kaydet"e basilinca yuklenir (kullanici
   * yanlis dosya secip Kaydet'ten once vazgecebilsin diye, bkz. docs/YOL_HARITASI.md). */
  async addAttachment(
    projectId: string,
    tenantId: string,
    file: { mimetype: string; buffer: Buffer; originalname: string },
  ): Promise<ProjectAttachmentView> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId },
    });
    if (!project) {
      throw new AppException(
        'NOT_FOUND',
        'Proje bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const existingCount = await this.prisma.projectAttachment.count({
      where: { projectId },
    });
    if (existingCount >= MAX_PROJECT_ATTACHMENTS_PER_PROJECT) {
      throw new AppException(
        'TOO_MANY_ATTACHMENTS',
        `En fazla ${MAX_PROJECT_ATTACHMENTS_PER_PROJECT} dosya eklenebilir.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const ext = detectAttachmentExtension(file.mimetype, file.buffer);
    const env =
      process.env.NODE_ENV === 'production' ? 'production' : 'development';
    const key = `PILENS/${env}/${tenantId}/projects/${randomUUID()}.${ext}`;
    await this.storage.upload(key, file.buffer, file.mimetype);
    const attachment = await this.prisma.projectAttachment.create({
      data: {
        projectId,
        fileKey: key,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.buffer.length,
      } as never,
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'Project',
      entityId: projectId,
      meta: { addedAttachment: attachment.fileName },
    });
    return this.mapAttachment(attachment);
  }

  async removeAttachment(
    projectId: string,
    attachmentId: string,
  ): Promise<void> {
    const attachment = await this.prisma.projectAttachment.findFirst({
      where: { id: attachmentId, projectId },
    });
    if (!attachment) {
      throw new AppException(
        'NOT_FOUND',
        'Dosya bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.storage.delete(attachment.fileKey);
    await this.prisma.projectAttachment.delete({ where: { id: attachmentId } });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'Project',
      entityId: projectId,
      meta: { removedAttachment: attachment.fileName },
    });
  }

  /** Kullaniciya gorunen dosya adini degistirir - R2'deki gercek fileKey/nesne
   * etkilenmez, sadece goruntulenen fileName. */
  async renameAttachment(
    projectId: string,
    attachmentId: string,
    fileName: string,
  ): Promise<ProjectAttachmentView> {
    const attachment = await this.prisma.projectAttachment.findFirst({
      where: { id: attachmentId, projectId },
    });
    if (!attachment) {
      throw new AppException(
        'NOT_FOUND',
        'Dosya bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const updated = await this.prisma.projectAttachment.update({
      where: { id: attachmentId },
      data: { fileName },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'Project',
      entityId: projectId,
      meta: { renamedAttachment: { from: attachment.fileName, to: fileName } },
    });
    return this.mapAttachment(updated);
  }

  async list(query: ProjectQueryDto): Promise<PagedResult<ProjectListItem>> {
    const cached = await this.cache.get<ProjectListItem>(query);
    if (cached) {
      return cached;
    }

    const { page, pageSize, accountId, q } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    // Postgres'in bu projede LC_CTYPE=C olmasi yuzunden `contains`/`mode: 'insensitive'`
    // Turkce aksanli karakterlerde (Ü, Ö, Ş, Ç, İ/ı) yanlis sonuc veriyor - bkz.
    // core/db/turkish-search.ts. "Bizden ilgili" (responsible) adi icin ProjectResponsible
    // uzerinden User'a JOIN yapiliyor.
    const matchingIds = q
      ? await findIdsBySql(
          this.prisma,
          Prisma.sql`
            SELECT DISTINCT p."id" FROM "crm_projects" p
            LEFT JOIN "crm_accounts" a ON a."id" = p."accountId"
            LEFT JOIN "crm_project_responsibles" pr ON pr."projectId" = p."id"
            LEFT JOIN "users" u ON u."id" = pr."userId"
            WHERE p."tenantId" = ${TenantContext.getOrThrow().tenantId}
              AND p."deletedAt" IS NULL
              AND (
                ${turkishContains(qualifiedColumn('p', 'name'), q)}
                OR ${turkishContains(qualifiedColumn('p', 'projectNumber'), q)}
                OR ${turkishContains(qualifiedColumn('a', 'name'), q)}
                OR ${turkishContains(qualifiedColumn('u', 'name'), q)}
              )
          `,
        )
      : null;

    const where = {
      ...(matchingIds ? { id: { in: matchingIds } } : {}),
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
    const accountNameById = await this.resolveAccountNames(
      projects.map((p) => p.accountId),
    );
    return projects.map((project) => ({
      ...project,
      responsibleUsers: byProject.get(project.id) ?? [],
      accountName: accountNameById.get(project.accountId) ?? 'Bir firma',
    }));
  }

  private async resolveAccountNames(
    accountIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(accountIds)];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true },
    });
    return new Map(accounts.map((account) => [account.id, account.name]));
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
    const { responsibles, attachments, ...rest } = project;
    const nameById = await this.resolveUserNames(
      (responsibles ?? []).map((r) => r.userId),
    );
    const responsibleUsers = (responsibles ?? []).map((r) => ({
      id: r.userId,
      name: nameById.get(r.userId) ?? 'Bir kullanici',
    }));
    return {
      ...rest,
      responsibleUsers,
      attachments: (attachments ?? []).map((a) => this.mapAttachment(a)),
    };
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
