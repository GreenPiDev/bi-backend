import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type ProductCategoryOption } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
} from './dto/product-category.dto';

@Injectable()
export class ProductCategoriesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<ProductCategoryOption[]> {
    return this.prisma.productCategoryOption.findMany({
      orderBy: { label: 'asc' },
    });
  }

  async create(dto: CreateProductCategoryDto): Promise<ProductCategoryOption> {
    try {
      const option = await this.prisma.productCategoryOption.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { label: dto.label } as never,
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'ProductCategoryOption',
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
          'PRODUCT_CATEGORY_ALREADY_EXISTS',
          'Bu kategori zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateProductCategoryDto,
  ): Promise<ProductCategoryOption> {
    const existing = await this.prisma.productCategoryOption.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        'NOT_FOUND',
        'Kategori bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const option = await this.prisma.productCategoryOption.update({
        where: { id },
        data: { label: dto.label },
      });
      await this.audit.log({
        action: 'UPDATE',
        entity: 'ProductCategoryOption',
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
          'PRODUCT_CATEGORY_ALREADY_EXISTS',
          'Bu kategori zaten tanimli.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const option = await this.prisma.productCategoryOption.findFirst({
      where: { id },
    });
    if (!option) {
      throw new AppException(
        'NOT_FOUND',
        'Kategori bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.productCategoryOption.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'ProductCategoryOption',
      entityId: id,
    });
  }
}
