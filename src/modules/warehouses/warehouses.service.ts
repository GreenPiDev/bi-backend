import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Warehouse } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  WarehouseQueryDto,
} from './dto/warehouse.dto';

const SORTABLE_FIELDS = ['name', 'createdAt'] as const;

@Injectable()
export class WarehousesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  /** /stok'taki duzenle/artir/azalt modallarinin depo secicisi baska bir sekmede
   * yeni bir depo eklenince sayfa yenilenmeden guncellensin diye (bkz. ProductList
   * ile ayni desen). */
  private async emitUpdated(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const warehouses = await this.prisma.warehouse.findMany({
      orderBy: { name: 'asc' },
    });
    this.realtime.emitToTenant(tenantId, 'warehouses.updated', warehouses);
  }

  async list(query: WarehouseQueryDto): Promise<PagedResult<Warehouse>> {
    const { page, pageSize, q } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'name',
      direction: 'asc',
    });

    const where = {
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string): Promise<Warehouse> {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id } });
    if (!warehouse) {
      throw new AppException(
        'NOT_FOUND',
        'Depo bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return warehouse;
  }

  async create(dto: CreateWarehouseDto): Promise<Warehouse> {
    const isDefault = dto.isDefault ?? false;
    try {
      const warehouse = await this.prisma.$transaction(async (tx) => {
        if (isDefault) {
          // Tek varsayilan depo garantisi: yeni depo varsayilan olarak
          // isaretleniyorsa, digerlerinin varsayilan bayragi once kaldirilir
          // (bkz. ProductListsService.create ile ayni desen).
          await tx.warehouse.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
          });
        }
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        return tx.warehouse.create({
          data: { name: dto.name, address: dto.address, isDefault } as never,
        });
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'Warehouse',
        entityId: warehouse.id,
        meta: { name: warehouse.name },
      });
      await this.emitUpdated();
      return warehouse;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'WAREHOUSE_ALREADY_EXISTS',
          'Bu adda bir depo zaten var.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateWarehouseDto): Promise<Warehouse> {
    await this.getById(id);
    try {
      const warehouse = await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) {
          await tx.warehouse.updateMany({
            where: { isDefault: true, id: { not: id } },
            data: { isDefault: false },
          });
        }
        return tx.warehouse.update({
          where: { id },
          data: dto,
        });
      });
      await this.audit.log({
        action: 'UPDATE',
        entity: 'Warehouse',
        entityId: id,
        meta: { name: warehouse.name },
      });
      await this.emitUpdated();
      return warehouse;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'WAREHOUSE_ALREADY_EXISTS',
          'Bu adda bir depo zaten var.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    const stockItemCount = await this.prisma.stockItem.count({
      where: { warehouseId: id },
    });
    if (stockItemCount > 0) {
      throw new AppException(
        'WAREHOUSE_NOT_EMPTY',
        'Bu depoda stok kayitlari var. Once bu depodaki stoklari baska bir depoya tasiyin ya da sifirlayin, sonra depoyu silin.',
        HttpStatus.CONFLICT,
        { stockItemCount },
      );
    }
    await this.prisma.warehouse.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'Warehouse',
      entityId: id,
    });
    await this.emitUpdated();
  }
}
