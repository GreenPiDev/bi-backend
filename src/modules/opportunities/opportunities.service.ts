import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Opportunity } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  CreateOpportunityDto,
  OpportunityQueryDto,
  UpdateOpportunityDto,
} from './dto/opportunity.dto';

const SORTABLE_FIELDS = ['name', 'stage', 'createdAt'] as const;

@Injectable()
export class OpportunitiesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(query: OpportunityQueryDto): Promise<PagedResult<Opportunity>> {
    const { page, pageSize, accountId, stage } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    const where = {
      ...(accountId ? { accountId } : {}),
      ...(stage ? { stage } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
      }),
      this.prisma.opportunity.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string): Promise<Opportunity> {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id },
    });
    if (!opportunity) {
      throw new AppException(
        'NOT_FOUND',
        'Firsat bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return opportunity;
  }

  async create(
    createdById: string,
    dto: CreateOpportunityDto,
  ): Promise<Opportunity> {
    const opportunity = await this.prisma.opportunity.create({
      // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
      data: { ...dto, createdById } as never,
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'Opportunity',
      entityId: opportunity.id,
      meta: { name: opportunity.name },
    });
    return opportunity;
  }

  async update(id: string, dto: UpdateOpportunityDto): Promise<Opportunity> {
    await this.getById(id);
    const opportunity = await this.prisma.opportunity.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'Opportunity',
      entityId: id,
    });
    return opportunity;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.opportunity.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'Opportunity',
      entityId: id,
    });
  }
}
