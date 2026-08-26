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

  async list(query: AccountQueryDto): Promise<PagedResult<Account>> {
    const { page, pageSize, q, city, sector, ownerId } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    const where = {
      ...(city ? { city } : {}),
      ...(sector ? { sector } : {}),
      ...(ownerId ? { ownerId } : {}),
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
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string) {
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
    return account;
  }

  async create(dto: CreateAccountDto): Promise<Account> {
    const account = await this.prisma.account.create({
      // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
      data: normalize(dto) as never,
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
