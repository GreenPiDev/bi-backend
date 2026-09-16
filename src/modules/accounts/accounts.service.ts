import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Account } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
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
  'sector',
  'website',
  'phone',
  'landlinePhone',
  'email',
  'address',
  'city',
  'district',
] as const;

export type AccountWithMeta = Account & { missingCriticalFields: string[] };

function withMissingCriticalFields(account: Account): AccountWithMeta {
  const missing: string[] = CRITICAL_FIELDS.filter((field) => {
    const value = account[field as keyof Account];
    return value === null || value === undefined || value === '';
  });
  if ((account.accountTypes ?? []).length === 0) {
    missing.push('accountTypes');
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
  ) {}

  async list(query: AccountQueryDto): Promise<PagedResult<AccountWithMeta>> {
    const { page, pageSize, q, city, sector, ownerId, from, to } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'name',
      direction: 'asc',
    });

    const where = {
      ...(city ? { city } : {}),
      ...(sector ? { sector } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
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

    return {
      data: data.map(withMissingCriticalFields),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
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
    return withMissingCriticalFields(account);
  }

  /** A2: sektor, tenant'in tanimladigi listeye karsi dogrulanir; tenant henuz
   * hic sektor tanimlamadiysa (bkz. VARSAYIMLAR V18) serbest metin kabul edilir. */
  private async assertValidSector(sector: string | undefined): Promise<void> {
    if (!sector) {
      return;
    }
    const options = await this.prisma.sectorOption.findMany();
    if (options.length === 0) {
      return;
    }
    if (!options.some((option) => option.label === sector)) {
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

  async create(dto: CreateAccountDto): Promise<Account> {
    const { contact, ...accountFields } = dto;
    await this.assertValidSector(accountFields.sector);
    if (contact) {
      await this.assertValidContactDepartment(contact.department);
      await this.assertValidContactTitle(contact.title);
    }
    const account = await this.prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: normalize(accountFields) as never,
      });
      if (contact) {
        await tx.contact.create({
          data: { ...contact, accountId: created.id } as never,
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
    return account;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.account.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'Account', entityId: id });
  }
}
