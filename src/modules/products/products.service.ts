import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Product } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { FileUrlService } from '../../core/storage/file-url.service';
import { R2StorageService } from '../../core/storage/r2-storage.service';
import { AuditService } from '../audit/audit.service';
import type {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/product.dto';
import { detectProductImageExtension } from './product-image-validation';

const SORTABLE_FIELDS = ['name', 'sku', 'createdAt'] as const;

export type ProductView = Product & { imageUrl: string | null };

@Injectable()
export class ProductsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly storage: R2StorageService,
    private readonly fileUrl: FileUrlService,
  ) {}

  private toView(product: Product): ProductView {
    return {
      ...product,
      imageUrl: this.fileUrl.build(product.imageKey, product.updatedAt),
    };
  }

  async list(query: ProductQueryDto): Promise<PagedResult<ProductView>> {
    const { page, pageSize, q } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'name',
      direction: 'asc',
    });

    const where = {
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { sku: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: data.map((p) => this.toView(p)),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string): Promise<ProductView> {
    const product = await this.findOrThrow(id);
    return this.toView(product);
  }

  private async findOrThrow(id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({ where: { id } });
    if (!product) {
      throw new AppException(
        'NOT_FOUND',
        'Urun bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return product;
  }

  async create(dto: CreateProductDto): Promise<ProductView> {
    const product = await this.prisma.product.create({
      // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
      data: { ...dto } as never,
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'Product',
      entityId: product.id,
      meta: { name: product.name },
    });
    return this.toView(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductView> {
    await this.findOrThrow(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({ action: 'UPDATE', entity: 'Product', entityId: id });
    return this.toView(product);
  }

  async remove(id: string): Promise<void> {
    const product = await this.findOrThrow(id);
    if (product.imageKey) {
      await this.storage.delete(product.imageKey);
    }
    await this.prisma.product.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'Product', entityId: id });
  }

  async uploadImage(
    id: string,
    tenantId: string,
    file: { mimetype: string; buffer: Buffer },
  ): Promise<ProductView> {
    const product = await this.findOrThrow(id);
    const ext = detectProductImageExtension(file.mimetype, file.buffer);
    const env =
      process.env.NODE_ENV === 'production' ? 'production' : 'development';
    // Urun basina tek gorsel oldugu icin anahtar sabit (id.ext) - ekstra bir klasor/uuid
    // gerekmiyor. Onceki yukleme farkli bir uzantiylaysa (orn. png -> jpg) eski anahtar
    // asagida ayrica silinir; ayni uzantida ise R2'deki nesne zaten uzerine yazilir.
    // Tarayici/CDN cache'i toView()'daki ?v=updatedAt sorgu parametresiyle atlatilir.
    const key = `PILENS/${env}/${tenantId}/product-images/${id}.${ext}`;

    await this.storage.upload(key, file.buffer, file.mimetype);
    if (product.imageKey && product.imageKey !== key) {
      await this.storage.delete(product.imageKey);
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: { imageKey: key },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'Product',
      entityId: id,
      meta: { imageUploaded: true },
    });
    return this.toView(updated);
  }

  async removeImage(id: string): Promise<ProductView> {
    const product = await this.findOrThrow(id);
    if (product.imageKey) {
      await this.storage.delete(product.imageKey);
    }
    const updated = await this.prisma.product.update({
      where: { id },
      data: { imageKey: null },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'Product',
      entityId: id,
      meta: { imageRemoved: true },
    });
    return this.toView(updated);
  }
}
