import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type PaymentMethodOption } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  CreatePaymentMethodOptionDto,
  UpdatePaymentMethodOptionDto,
} from './dto/payment-method-option.dto';

@Injectable()
export class PaymentMethodOptionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<PaymentMethodOption[]> {
    return this.prisma.paymentMethodOption.findMany({
      orderBy: { label: 'asc' },
    });
  }

  async create(
    dto: CreatePaymentMethodOptionDto,
  ): Promise<PaymentMethodOption> {
    try {
      const option = await this.prisma.paymentMethodOption.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { label: dto.label } as never,
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'PaymentMethodOption',
        entityId: option.id,
        meta: { label: option.label },
      });
      return option;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'PAYMENT_METHOD_ALREADY_EXISTS',
          'Bu odeme yontemi zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdatePaymentMethodOptionDto,
  ): Promise<PaymentMethodOption> {
    const existing = await this.prisma.paymentMethodOption.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        'NOT_FOUND',
        'Odeme yontemi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const option = await this.prisma.paymentMethodOption.update({
        where: { id },
        data: { label: dto.label },
      });
      await this.audit.log({
        action: 'UPDATE',
        entity: 'PaymentMethodOption',
        entityId: option.id,
        meta: { label: option.label },
      });
      return option;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'PAYMENT_METHOD_ALREADY_EXISTS',
          'Bu odeme yontemi zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const option = await this.prisma.paymentMethodOption.findFirst({
      where: { id },
    });
    if (!option) {
      throw new AppException(
        'NOT_FOUND',
        'Odeme yontemi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.paymentMethodOption.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'PaymentMethodOption',
      entityId: id,
    });
  }
}
