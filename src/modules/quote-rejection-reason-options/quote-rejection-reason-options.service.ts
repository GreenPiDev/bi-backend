import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type QuoteRejectionReasonOption } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  CreateQuoteRejectionReasonOptionDto,
  UpdateQuoteRejectionReasonOptionDto,
} from './dto/quote-rejection-reason-option.dto';

@Injectable()
export class QuoteRejectionReasonOptionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  list(): Promise<QuoteRejectionReasonOption[]> {
    return this.prisma.quoteRejectionReasonOption.findMany({
      orderBy: { label: 'asc' },
    });
  }

  private async emitUpdated(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const options = await this.list();
    this.realtime.emitToTenant(
      tenantId,
      'quoteRejectionReasonOptions.updated',
      options,
    );
  }

  async create(
    dto: CreateQuoteRejectionReasonOptionDto,
  ): Promise<QuoteRejectionReasonOption> {
    try {
      const option = await this.prisma.quoteRejectionReasonOption.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { label: dto.label } as never,
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'QuoteRejectionReasonOption',
        entityId: option.id,
        meta: { label: option.label },
      });
      await this.emitUpdated();
      return option;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'QUOTE_REJECTION_REASON_ALREADY_EXISTS',
          'Bu red sebebi zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateQuoteRejectionReasonOptionDto,
  ): Promise<QuoteRejectionReasonOption> {
    const existing = await this.prisma.quoteRejectionReasonOption.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        'NOT_FOUND',
        'Red sebebi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const option = await this.prisma.quoteRejectionReasonOption.update({
        where: { id },
        data: { label: dto.label },
      });
      await this.audit.log({
        action: 'UPDATE',
        entity: 'QuoteRejectionReasonOption',
        entityId: option.id,
        meta: { label: option.label },
      });
      await this.emitUpdated();
      return option;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'QUOTE_REJECTION_REASON_ALREADY_EXISTS',
          'Bu red sebebi zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const option = await this.prisma.quoteRejectionReasonOption.findFirst({
      where: { id },
    });
    if (!option) {
      throw new AppException(
        'NOT_FOUND',
        'Red sebebi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.quoteRejectionReasonOption.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'QuoteRejectionReasonOption',
      entityId: id,
    });
    await this.emitUpdated();
  }
}
