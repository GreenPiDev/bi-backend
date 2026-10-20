import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type Contact } from '@prisma/client';
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
  buildExportRows,
  type ExportColumnDef,
} from '../../core/xlsx/list-export.util';
import { rowsToXlsxBuffer } from '../../core/xlsx/xlsx-export.util';
import { AuditService } from '../audit/audit.service';
import { ContactsCacheService } from './contacts-cache.service';
import type {
  ContactExportQueryDto,
  ContactQueryDto,
  CreateContactDto,
  UpdateContactDto,
} from './dto/contact.dto';

const SORTABLE_FIELDS = [
  'lastName',
  'firstName',
  'account',
  'createdAt',
] as const;
// Bu projenin Prisma surumunde orderBy `mode: 'insensitive'` desteklemiyor (sadece
// where filtrelerinde var) ve DB'nin varsayilan collation'i ASCII sirasi kullaniyor
// ("M" < "a"), o yuzden bu alanlar icin DB-seviyesi siralamaya guvenilmiyor -
// eslesen tum kayitlar cekilip Intl.Collator ile JS tarafinda siralanip sonra
// sayfalaniyor (bkz. asagidaki list()). `account` bir iliski oldugu icin ayrica
// orderBy: { account: { name } } Prisma'da da mumkun degil (ayni case-insensitive
// kisitiyla), o yuzden ayni JS-tarafi dala giriyor.
const CASE_INSENSITIVE_SORT_FIELDS = new Set<string>([
  'firstName',
  'lastName',
  'account',
]);
const nameCollator = new Intl.Collator('tr', { sensitivity: 'base' });
type SortableContactRow = Contact & { account: { name: string } | null };
const SORT_ACCESSORS: Record<string, (row: SortableContactRow) => string> = {
  firstName: (row) => row.firstName,
  lastName: (row) => row.lastName,
  account: (row) => row.account?.name ?? '',
};

export type ContactWithMeta = Contact & { createdByName: string | null };

type ContactExportRow = ContactWithMeta & {
  account: { id: string; name: string } | null;
};

/** Frontend i18n/tr.ts'teki tr.crm.contacts.statusActive/statusInactive ile
 * birebir ayni metinler - bkz. ContactsService.exportFiltered. */
const CONTACT_STATUS_LABELS: Record<Contact['status'], string> = {
  ACTIVE: 'Aktif',
  INACTIVE: 'Pasif',
};

/** Frontend contacts-list-page.tsx'teki ALL_COLUMNS ile birebir ayni kolon
 * basliklari/degerleri. */
type ContactExportColumn =
  | 'name'
  | 'account'
  | 'department'
  | 'phone'
  | 'email'
  | 'status'
  | 'createdByName';
const CONTACT_EXPORT_COLUMN_DEFS: Record<
  ContactExportColumn,
  ExportColumnDef<ContactExportRow>
> = {
  name: {
    header: 'Ad Soyad',
    value: (c) => `${c.firstName} ${c.lastName}`.trim(),
  },
  account: { header: 'Firma', value: (c) => c.account?.name ?? '' },
  department: { header: 'Departman', value: (c) => c.department ?? '' },
  phone: { header: 'Telefon', value: (c) => c.phone ?? '' },
  email: { header: 'E-posta', value: (c) => c.email ?? '' },
  status: { header: 'Durum', value: (c) => CONTACT_STATUS_LABELS[c.status] },
  createdByName: { header: 'Oluşturan', value: (c) => c.createdByName ?? '' },
};

function normalize<T extends object>(dto: T): T {
  const result = { ...dto } as Record<string, unknown>;
  if ('email' in result && result.email === '') {
    result.email = null;
  }
  return result as T;
}

@Injectable()
export class ContactsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly cache: ContactsCacheService,
  ) {}

  /** createdById iliskisel bir FK degil (bkz. schema); isim gostermek icin
   * User tablosundan toplu cozumleniyor (quotes.service.ts'teki ayni desen). */
  private async attachCreatedByNames<T extends { createdById: string | null }>(
    rows: T[],
  ): Promise<(T & { createdByName: string | null })[]> {
    const ids = [
      ...new Set(
        rows
          .map((row) => row.createdById)
          .filter((id): id is string => id != null),
      ),
    ];
    const users =
      ids.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          })
        : [];
    const nameById = new Map(users.map((user) => [user.id, user.name]));
    return rows.map((row) => ({
      ...row,
      createdByName: row.createdById
        ? (nameById.get(row.createdById) ?? null)
        : null,
    }));
  }

  /** list() ve exportFiltered() ayni filtre alanlarini (q/accountId/ownerId/status/
   * createdById) paylasiyor - tek yerde tutuluyor. */
  private async buildWhere(
    query: Pick<
      ContactQueryDto,
      'q' | 'accountId' | 'ownerId' | 'status' | 'createdById'
    >,
  ) {
    const { q, accountId, ownerId, status, createdById } = query;

    // Postgres'in bu projede LC_CTYPE=C olmasi yuzunden `contains`/`mode: 'insensitive'`
    // Turkce aksanli karakterlerde (Ü, Ö, Ş, Ç, İ/ı) yanlis sonuc veriyor - bkz.
    // core/db/turkish-search.ts. accountId'nin de bir iliski uzerinden (account.name)
    // aranmasi gerektigi icin burada JOIN'li ham sorgu kuruluyor.
    const matchingIds = q
      ? await findIdsBySql(
          this.prisma,
          Prisma.sql`
            SELECT c."id" FROM "crm_contacts" c
            LEFT JOIN "crm_accounts" a
              ON a."id" = c."accountId" AND a."deletedAt" IS NULL
            WHERE c."tenantId" = ${TenantContext.getOrThrow().tenantId}
              AND c."deletedAt" IS NULL
              AND (
                ${turkishContains(qualifiedColumn('c', 'firstName'), q)}
                OR ${turkishContains(qualifiedColumn('c', 'lastName'), q)}
                OR ${turkishContains(qualifiedColumn('c', 'email'), q)}
                OR ${turkishContains(qualifiedColumn('c', 'phone'), q)}
                OR ${turkishContains(qualifiedColumn('a', 'name'), q)}
              )
          `,
        )
      : null;

    return {
      ...(matchingIds ? { id: { in: matchingIds } } : {}),
      ...(accountId ? { accountId } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(status ? { status } : {}),
      ...(createdById ? { createdById } : {}),
    };
  }

  /** Ad-hoc (2026-10-20, kullanici istegi, bkz. CLAUDE.md): /kisiler sayfasindaki
   * "Excel'e Aktar" butonu - sayfalama YOK, o anki filtreyle eslesen tum kayitlar,
   * sadece `query.columns`'ta istenen (frontend'de o an gorunur olan) kolonlarla disa
   * aktarilir - bkz. core/xlsx/list-export.util.ts. */
  async exportFiltered(query: ContactExportQueryDto): Promise<Buffer> {
    const where = await this.buildWhere(query);
    const contacts = await this.prisma.contact.findMany({
      where,
      orderBy: { lastName: 'asc' },
      include: { account: { select: { id: true, name: true } } },
    });
    const rows = await this.attachCreatedByNames(contacts);

    const exportRows = buildExportRows(
      rows,
      query.columns,
      (key) => CONTACT_EXPORT_COLUMN_DEFS[key as ContactExportColumn],
    );
    return rowsToXlsxBuffer(exportRows, 'Kişiler');
  }

  async list(query: ContactQueryDto): Promise<PagedResult<ContactWithMeta>> {
    const cached = await this.cache.get(query);
    if (cached) {
      return cached;
    }

    const { page, pageSize } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'lastName',
      direction: 'asc',
    });

    const where = await this.buildWhere(query);

    if (CASE_INSENSITIVE_SORT_FIELDS.has(field)) {
      const accessor = SORT_ACCESSORS[field];
      const all = await this.prisma.contact.findMany({
        where,
        include: { account: { select: { id: true, name: true } } },
      });
      all.sort((a, b) => {
        const cmp = nameCollator.compare(accessor(a), accessor(b));
        return direction === 'asc' ? cmp : -cmp;
      });
      const total = all.length;
      const pageRows = all.slice(
        (page - 1) * pageSize,
        (page - 1) * pageSize + pageSize,
      );
      const result = {
        data: await this.attachCreatedByNames(pageRows),
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
      await this.cache.set(query, result);
      return result;
    }

    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        include: { account: { select: { id: true, name: true } } },
      }),
      this.prisma.contact.count({ where }),
    ]);

    const result = {
      data: await this.attachCreatedByNames(data),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
    await this.cache.set(query, result);
    return result;
  }

  async getById(id: string): Promise<ContactWithMeta> {
    const contact = await this.prisma.contact.findFirst({
      where: { id },
      include: { account: { select: { id: true, name: true } } },
    });
    if (!contact) {
      throw new AppException(
        'NOT_FOUND',
        'Kisi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const [withName] = await this.attachCreatedByNames([contact]);
    return withName;
  }

  private async assertAccountExists(accountId: string | undefined) {
    if (!accountId) {
      return;
    }
    const account = await this.prisma.account.findFirst({
      where: { id: accountId },
    });
    if (!account) {
      throw new AppException(
        'INVALID_REFERENCE',
        'Belirtilen firma bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** Sektor (A2) ile ayni desen: tenant henuz departman tanimlamadiysa serbest
   * metin kabul edilir, tanimladiysa sadece listeden secim gecerlidir. */
  private async assertValidDepartment(
    department: string | undefined,
  ): Promise<void> {
    if (!department) {
      return;
    }
    const options = await this.prisma.departmentOption.findMany();
    if (options.length === 0) {
      return;
    }
    if (!options.some((option) => option.label === department)) {
      throw new AppException(
        'INVALID_DEPARTMENT',
        'Belirtilen departman tanimli degil.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async assertValidTitle(title: string | undefined): Promise<void> {
    if (!title) {
      return;
    }
    const options = await this.prisma.titleOption.findMany();
    if (options.length === 0) {
      return;
    }
    if (!options.some((option) => option.label === title)) {
      throw new AppException(
        'INVALID_TITLE',
        'Belirtilen unvan tanimli degil.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async create(createdById: string, dto: CreateContactDto): Promise<Contact> {
    await this.assertAccountExists(dto.accountId);
    await this.assertValidDepartment(dto.department);
    await this.assertValidTitle(dto.title);
    const contact = await this.prisma.contact.create({
      // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
      data: { ...normalize(dto), createdById } as never,
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'Contact',
      entityId: contact.id,
      meta: { firstName: contact.firstName, lastName: contact.lastName },
    });
    await this.cache.invalidate();
    return contact;
  }

  async update(id: string, dto: UpdateContactDto): Promise<Contact> {
    await this.getById(id);
    await this.assertAccountExists(dto.accountId);
    await this.assertValidDepartment(dto.department);
    await this.assertValidTitle(dto.title);
    const data = normalize(dto) as Record<string, unknown>;
    // K2: iletisim tarihi elle guncellenince inaktivite bildirimi sifirlanir,
    // esik tekrar asilirsa yeni bir bildirim gonderilebilsin.
    if (dto.lastContactedAt !== undefined) {
      data.inactivityNotifiedAt = null;
    }
    const contact = await this.prisma.contact.update({
      where: { id },
      data: data as never,
    });
    await this.audit.log({ action: 'UPDATE', entity: 'Contact', entityId: id });
    await this.cache.invalidate();
    return contact;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.contact.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'Contact', entityId: id });
    await this.cache.invalidate();
  }
}
