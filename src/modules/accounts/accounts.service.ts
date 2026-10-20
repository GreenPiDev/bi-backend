import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Account, AccountType } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { findIdsByTurkishSearch } from '../../core/db/turkish-search';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
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
import { normalizeAccountName } from './account-name.util';
import { AccountsCacheService } from './accounts-cache.service';
import type {
  AccountExportQueryDto,
  AccountQueryDto,
  CreateAccountDto,
  UpdateAccountDto,
} from './dto/account.dto';

const SORTABLE_FIELDS = [
  'name',
  'city',
  'createdAt',
  'interactionCount',
  'quoteCount',
] as const;
// 'name': contacts.service.ts'teki ayni sorun - Postgres'in bu projede
// LC_CTYPE=C olmasi yuzunden DB-seviyesi orderBy ASCII sirasi kullanir ("M" < "a"),
// o yuzden Intl.Collator ile JS tarafinda siralaniyor.
const CASE_INSENSITIVE_SORT_FIELDS = new Set<string>(['name']);
const nameCollator = new Intl.Collator('tr', { sensitivity: 'base' });
// 'interactionCount'/'quoteCount' Account tablosunda kolon degil, attachCounts()
// ile ayri bir groupBy sorgusundan sonradan eklenen hesaplanmis degerler - bu
// yuzden Prisma orderBy'a hic verilemez, eslesen tum satirlar cekilip sayilar
// hesaplandiktan sonra JS tarafinda siralanip sayfalanir.
const COMPUTED_SORT_FIELDS = new Set<string>([
  'interactionCount',
  'quoteCount',
]);

/**
 * A5: "kesin bilmek istedigimiz" alanlar (bkz. VARSAYIMLAR V18) - bu alanlardan
 * biri bossa firma listesinde uyari ikonu gosterilir. Formdaki tum metin
 * alanlarini kapsar (accountTypes ayri, dizi oldugu icin asagida ayrica
 * kontrol edilir).
 */
const CRITICAL_FIELDS = [
  'taxNumber',
  'taxOffice',
  'website',
  'phone',
  'landlinePhone',
  'email',
  'address',
  'city',
  'district',
] as const;

export type AccountWithMeta = Account & {
  missingCriticalFields: string[];
  createdByName: string | null;
  interactionCount: number;
  quoteCount: number;
};

/** Frontend i18n/tr.ts'teki tr.crm.accounts.accountTypeOptions ile birebir ayni
 * metinler - bkz. AccountsService.exportFiltered. */
const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CUSTOMER: 'Müşteri',
  SUPPLIER: 'Tedarikçi',
  CONTRACTOR: 'Yüklenici',
  SUBCONTRACTOR: 'Alt Yüklenici',
};

/** Frontend accounts-list-page.tsx'teki ALL_COLUMNS ile birebir ayni kolon
 * basliklari/degerleri (sabit kolonlar - dinamik `attr:<key>` kolonlari
 * AccountsService.exportFiltered icinde ayrica cozumlenir). */
type AccountExportColumn =
  | 'name'
  | 'city'
  | 'phone'
  | 'email'
  | 'sector'
  | 'accountTypes'
  | 'interactionCount'
  | 'quoteCount'
  | 'createdByName';
const ACCOUNT_EXPORT_COLUMN_DEFS: Record<
  AccountExportColumn,
  ExportColumnDef<AccountWithMeta>
> = {
  name: { header: 'Ad', value: (a) => a.name },
  city: { header: 'Şehir', value: (a) => a.city ?? '' },
  phone: { header: 'Telefon', value: (a) => a.phone ?? '' },
  email: { header: 'E-posta', value: (a) => a.email ?? '' },
  sector: { header: 'Sektör', value: (a) => (a.sector ?? []).join(', ') },
  accountTypes: {
    header: 'Firma Türü',
    value: (a) =>
      a.accountTypes.map((type) => ACCOUNT_TYPE_LABELS[type]).join(', '),
  },
  interactionCount: {
    header: 'Görüşme',
    value: (a) => String(a.interactionCount),
  },
  quoteCount: { header: 'Teklif', value: (a) => String(a.quoteCount) },
  createdByName: { header: 'Oluşturan', value: (a) => a.createdByName ?? '' },
};

function withMissingCriticalFields<T extends Account>(
  account: T,
): T & { missingCriticalFields: string[] } {
  const missing: string[] = CRITICAL_FIELDS.filter((field) => {
    const value = account[field as keyof Account];
    return value === null || value === undefined || value === '';
  });
  if ((account.accountTypes ?? []).length === 0) {
    missing.push('accountTypes');
  }
  if ((account.sector ?? []).length === 0) {
    missing.push('sector');
  }
  return { ...account, missingCriticalFields: missing };
}

function normalize<T extends object>(dto: T): T {
  const result = { ...dto } as Record<string, unknown>;
  for (const key of ['website', 'email', 'taxNumber']) {
    if (key in result && result[key] === '') {
      result[key] = null;
    }
  }
  // Manuel formdan (/firmalar/yeni, /firmalar/:id/duzenle) girilen firma adi da
  // ice aktarma/gorusme akislarindaki (bkz. account-name.util.ts) ayni TR-locale
  // buyuk harf normalizasyonuna tabi - aksi halde bu formdan girilen bir firma,
  // sonraki bir import/gorusme eslestirmesinde bulunamayip duplike olusabilir.
  if (typeof result.name === 'string') {
    result.name = normalizeAccountName(result.name);
  }
  return result as T;
}

@Injectable()
export class AccountsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly cache: AccountsCacheService,
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

  /** "GORUSME"/"TEKLIF" kolonlari (bkz. firmalar listesi) - account-level groupBy ile
   * sayiliyor, deletedAt filtresi (soft-delete) tenant-scoped extension'in sadece
   * top-level findMany/count'u kapsamasindan dolayi _count include'u yerine ayri
   * sorgu olarak yazildi (nested include'da soft-delete otomatik filtrelenmez). */
  private async attachCounts<T extends { id: string }>(
    rows: T[],
  ): Promise<(T & { interactionCount: number; quoteCount: number })[]> {
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      return rows.map((row) => ({
        ...row,
        interactionCount: 0,
        quoteCount: 0,
      }));
    }
    const [interactionGroups, quoteGroups] = await Promise.all([
      this.prisma.interaction.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.quote.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const interactionCountByAccount = new Map(
      interactionGroups.map((group) => [group.accountId, group._count._all]),
    );
    const quoteCountByAccount = new Map(
      quoteGroups.map((group) => [group.accountId, group._count._all]),
    );
    return rows.map((row) => ({
      ...row,
      interactionCount: interactionCountByAccount.get(row.id) ?? 0,
      quoteCount: quoteCountByAccount.get(row.id) ?? 0,
    }));
  }

  /** list() ve exportFiltered() ayni filtre alanlarini (q/city/sector/ownerId/
   * createdById/from-to/notContactedDays) paylasiyor - tek yerde tutuluyor. */
  private async buildWhere(
    query: Pick<
      AccountQueryDto,
      | 'q'
      | 'city'
      | 'sector'
      | 'ownerId'
      | 'createdById'
      | 'from'
      | 'to'
      | 'notContactedDays'
    >,
  ) {
    const {
      q,
      city,
      sector,
      ownerId,
      createdById,
      from,
      to,
      notContactedDays,
    } = query;

    // Postgres'in bu projede LC_CTYPE=C olmasi yuzunden `contains`/`mode: 'insensitive'`
    // Turkce aksanli karakterlerde (Ü, Ö, Ş, Ç, İ/ı) yanlis sonuc veriyor - bkz.
    // core/db/turkish-search.ts. Eslesen id'ler onceden cozulup asagida `id: { in: [...] }`
    // olarak kullanilir.
    const matchingIds = q
      ? await findIdsByTurkishSearch(
          this.prisma,
          'crm_accounts',
          ['name', 'email', 'phone'],
          q,
          { softDelete: true },
        )
      : null;

    return {
      ...(matchingIds ? { id: { in: matchingIds } } : {}),
      ...(city ? { city } : {}),
      ...(sector ? { sector: { has: sector } } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(createdById ? { createdById } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(notContactedDays
        ? {
            interactions: {
              none: {
                deletedAt: null,
                occurredAt: {
                  gte: new Date(
                    Date.now() - notContactedDays * 24 * 60 * 60 * 1000,
                  ),
                },
              },
            },
          }
        : {}),
    };
  }

  /** Ad-hoc (2026-10-20, kullanici istegi, bkz. CLAUDE.md): /firmalar sayfasindaki
   * "Excel'e Aktar" butonu - sayfalama YOK, o anki filtreyle eslesen tum kayitlar,
   * sadece `query.columns`'ta istenen (frontend'de o an gorunur olan) kolonlarla disa
   * aktarilir. Sabit kolonlarin yaninda, ice aktarmada "ozel alan olarak sakla"
   * secilen `attr:<key>` kolonlari da (accounts-list-page.tsx'teki attributeColumns
   * deseniyle ayni) desteklenir - bu yuzden sabit bir enum yerine serbest anahtar
   * kullanan merkezi buildExportRows cozumleyicisi kullaniliyor (bkz.
   * core/xlsx/list-export.util.ts). */
  async exportFiltered(query: AccountExportQueryDto): Promise<Buffer> {
    const where = await this.buildWhere(query);
    const accounts = await this.prisma.account.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    const withNames = await this.attachCreatedByNames(accounts);
    const withCounts = await this.attachCounts(withNames);
    const rows = withCounts.map(withMissingCriticalFields);

    const resolveColumn = (
      key: string,
    ): ExportColumnDef<(typeof rows)[number]> | undefined => {
      if (key.startsWith('attr:')) {
        const attributeKey = key.slice('attr:'.length);
        return {
          header: attributeKey,
          value: (account) => {
            const customFields = account.customFields;
            if (
              !customFields ||
              typeof customFields !== 'object' ||
              Array.isArray(customFields)
            ) {
              return '';
            }
            const value = (customFields as Record<string, unknown>)[
              attributeKey
            ];
            return value == null ? '' : String(value);
          },
        };
      }
      return ACCOUNT_EXPORT_COLUMN_DEFS[key as AccountExportColumn];
    };

    const exportRows = buildExportRows(rows, query.columns, resolveColumn);
    return rowsToXlsxBuffer(exportRows, 'Firmalar');
  }

  async list(query: AccountQueryDto): Promise<PagedResult<AccountWithMeta>> {
    const cached = await this.cache.get(query);
    if (cached) {
      return cached;
    }

    const { page, pageSize } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'name',
      direction: 'asc',
    });

    const where = await this.buildWhere(query);

    if (COMPUTED_SORT_FIELDS.has(field)) {
      const sortField = field as 'interactionCount' | 'quoteCount';
      const all = await this.prisma.account.findMany({ where });
      const withNames = await this.attachCreatedByNames(all);
      const withCounts = await this.attachCounts(withNames);
      withCounts.sort((a, b) => {
        const diff = a[sortField] - b[sortField];
        return direction === 'asc' ? diff : -diff;
      });
      const total = withCounts.length;
      const pageRows = withCounts.slice(
        (page - 1) * pageSize,
        (page - 1) * pageSize + pageSize,
      );
      const result = {
        data: pageRows.map(withMissingCriticalFields),
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

    if (CASE_INSENSITIVE_SORT_FIELDS.has(field)) {
      const all = await this.prisma.account.findMany({ where });
      all.sort((a, b) => {
        const cmp = nameCollator.compare(a.name, b.name);
        return direction === 'asc' ? cmp : -cmp;
      });
      const total = all.length;
      const pageRows = all.slice(
        (page - 1) * pageSize,
        (page - 1) * pageSize + pageSize,
      );
      const withNames = await this.attachCreatedByNames(pageRows);
      const withCounts = await this.attachCounts(withNames);
      const result = {
        data: withCounts.map(withMissingCriticalFields),
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
      this.prisma.account.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
      }),
      this.prisma.account.count({ where }),
    ]);

    const withNames = await this.attachCreatedByNames(data);
    const withCounts = await this.attachCounts(withNames);
    const result = {
      data: withCounts.map(withMissingCriticalFields),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
    await this.cache.set(query, result);
    return result;
  }

  async getById(id: string): Promise<AccountWithMeta> {
    const account = await this.prisma.account.findFirst({
      where: { id },
      include: { contacts: true },
    });
    if (!account) {
      throw new AppException(
        'NOT_FOUND',
        'Firma bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const [withName] = await this.attachCreatedByNames([account]);
    const [withCount] = await this.attachCounts([withName]);
    return withMissingCriticalFields(withCount);
  }

  /** A2: sektor(ler), tenant'in tanimladigi listeye karsi dogrulanir; tenant henuz
   * hic sektor tanimlamadiysa (bkz. VARSAYIMLAR V18) serbest metin kabul edilir.
   * Coklu secim destegi eklendikten sonra (bkz. VARSAYIMLAR V41) her secilen deger
   * ayri ayri dogrulanir. */
  private async assertValidSector(
    sectors: string[] | undefined,
  ): Promise<void> {
    if (!sectors || sectors.length === 0) {
      return;
    }
    const options = await this.prisma.sectorOption.findMany();
    if (options.length === 0) {
      return;
    }
    const validLabels = new Set(options.map((option) => option.label));
    const invalid = sectors.find((sector) => !validLabels.has(sector));
    if (invalid) {
      throw new AppException(
        'INVALID_SECTOR',
        'Belirtilen sektor tanimli degil.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** Ayni A2 deseni, yetkili kisi nested-create'inde departman/unvan icin -
   * ContactsService'teki karsiligiyla kasitli olarak ayni (bkz. V-yeni,
   * AccountsModule <-> ContactsModule baglantisi kurulmasin diye kucuk bir
   * mantik tekrar edilir). */
  private async assertValidContactDepartment(
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

  private async assertValidContactTitle(
    title: string | undefined,
  ): Promise<void> {
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

  async create(createdById: string, dto: CreateAccountDto): Promise<Account> {
    const { contact, ...accountFields } = dto;
    await this.assertValidSector(accountFields.sector);
    if (contact) {
      await this.assertValidContactDepartment(contact.department);
      await this.assertValidContactTitle(contact.title);
    }
    const account = await this.prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { ...normalize(accountFields), createdById } as never,
      });
      if (contact) {
        await tx.contact.create({
          data: { ...contact, accountId: created.id, createdById } as never,
        });
      }
      return created;
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'Account',
      entityId: account.id,
      meta: { name: account.name },
    });
    await this.cache.invalidate();
    return account;
  }

  async update(id: string, dto: UpdateAccountDto): Promise<Account> {
    await this.getById(id);
    await this.assertValidSector(dto.sector);
    const account = await this.prisma.account.update({
      where: { id },
      data: normalize(dto) as never,
    });
    await this.audit.log({ action: 'UPDATE', entity: 'Account', entityId: id });
    await this.cache.invalidate();
    return account;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.account.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'Account', entityId: id });
    await this.cache.invalidate();
  }
}
