import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { IbanOption } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type { IbanOptionDto } from './dto/iban-option.dto';

@Injectable()
export class IbanOptionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<IbanOption[]> {
    return this.prisma.ibanOption.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async create(dto: IbanOptionDto): Promise<IbanOption> {
    const option = await this.prisma.ibanOption.create({
      // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
      data: {
        bankName: dto.bankName,
        accountHolderName: dto.accountHolderName,
        accountNumber: dto.accountNumber ?? null,
        iban: dto.iban,
      } as never,
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'IbanOption',
      entityId: option.id,
      meta: { bankName: option.bankName, iban: option.iban },
    });
    return option;
  }

  async update(id: string, dto: IbanOptionDto): Promise<IbanOption> {
    const existing = await this.prisma.ibanOption.findFirst({ where: { id } });
    if (!existing) {
      throw new AppException(
        'NOT_FOUND',
        'IBAN tanimi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const option = await this.prisma.ibanOption.update({
      where: { id },
      data: {
        bankName: dto.bankName,
        accountHolderName: dto.accountHolderName,
        accountNumber: dto.accountNumber ?? null,
        iban: dto.iban,
      },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'IbanOption',
      entityId: option.id,
      meta: { bankName: option.bankName, iban: option.iban },
    });
    return option;
  }

  async remove(id: string): Promise<void> {
    const option = await this.prisma.ibanOption.findFirst({ where: { id } });
    if (!option) {
      throw new AppException(
        'NOT_FOUND',
        'IBAN tanimi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.ibanOption.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'IbanOption',
      entityId: id,
    });
  }
}
