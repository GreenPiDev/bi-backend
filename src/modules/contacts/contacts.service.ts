import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Contact } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  ContactQueryDto,
  CreateContactDto,
  UpdateContactDto,
} from './dto/contact.dto';

const SORTABLE_FIELDS = ['lastName', 'firstName', 'createdAt'] as const;
// Bu projenin Prisma surumunde orderBy `mode: 'insensitive'` desteklemiyor (sadece
// where filtrelerinde var) ve DB'nin varsayilan collation'i ASCII sirasi kullaniyor
// ("M" < "a"), o yuzden bu alanlar icin DB-seviyesi siralamaya guvenilmiyor -
// eslesen tum kayitlar cekilip Intl.Collator ile JS tarafinda siralanip sonra
// sayfalaniyor (bkz. asagidaki list()).
const CASE_INSENSITIVE_SORT_FIELDS = new Set<string>(['firstName', 'lastName']);
const nameCollator = new Intl.Collator('tr', { sensitivity: 'base' });

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
  ) {}

  async list(query: ContactQueryDto): Promise<PagedResult<Contact>> {
    const { page, pageSize, q, accountId, ownerId, status } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'lastName',
      direction: 'asc',
    });

    const where = {
      ...(accountId ? { accountId } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' as const } },
              { lastName: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q, mode: 'insensitive' as const } },
              {
                account: {
                  deletedAt: null,
                  name: { contains: q, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    };

    if (CASE_INSENSITIVE_SORT_FIELDS.has(field)) {
      const sortField = field as 'firstName' | 'lastName';
      const all = await this.prisma.contact.findMany({
        where,
        include: { account: { select: { id: true, name: true } } },
      });
      all.sort((a, b) => {
        const cmp = nameCollator.compare(a[sortField], b[sortField]);
        return direction === 'asc' ? cmp : -cmp;
      });
      const total = all.length;
      const data = all.slice(
        (page - 1) * pageSize,
        (page - 1) * pageSize + pageSize,
      );
      return {
        data,
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
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

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string) {
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
    return contact;
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

  async create(dto: CreateContactDto): Promise<Contact> {
    await this.assertAccountExists(dto.accountId);
    await this.assertValidDepartment(dto.department);
    await this.assertValidTitle(dto.title);
    const contact = await this.prisma.contact.create({
      // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
      data: normalize(dto) as never,
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'Contact',
      entityId: contact.id,
      meta: { firstName: contact.firstName, lastName: contact.lastName },
    });
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
    return contact;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.contact.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'Contact', entityId: id });
  }
}
