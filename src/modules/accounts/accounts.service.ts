import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Account } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import { AccountsCacheService } from './accounts-cache.service';
import type {
  AccountQueryDto,
  CreateAccountDto,
  UpdateAccountDto,
} from './dto/account.dto';

const SORTABLE_FIELDS = ['name', 'city', 'createdAt'] as const;

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

  async list(query: AccountQueryDto): Promise<PagedResult<AccountWithMeta>> {
    const cached = await this.cache.get(query);
    if (cached) {
      return cached;
    }

    const {
      page,
      pageSize,
      q,
      city,
      sector,
      ownerId,
      from,
      to,
      notContactedDays,
    } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'name',
      direction: 'asc',
    });

    const where = {
      ...(city ? { city } : {}),
      ...(sector ? { sector: { has: sector } } : {}),
      ...(ownerId ? { ownerId } : {}),
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
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

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
    const result = {
      data: withNames.map(withMissingCriticalFields),
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
    return withMissingCriticalFields(withName);
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
