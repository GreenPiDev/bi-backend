import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Warehouse } from '@prisma/client';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateWarehouseSchema,
  WarehouseQuerySchema,
  UpdateWarehouseSchema,
  type CreateWarehouseDto,
  type WarehouseQueryDto,
  type UpdateWarehouseDto,
} from './dto/warehouse.dto';
import { WarehousesService } from './warehouses.service';

@ModulePage('warehouses')
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  @RequiresPermission('warehouses', 'VIEW')
  list(
    @Query(new ZodValidationPipe(WarehouseQuerySchema))
    query: WarehouseQueryDto,
  ): Promise<PagedResult<Warehouse>> {
    return this.warehouses.list(query);
  }

  @Get(':id')
  @RequiresPermission('warehouses', 'VIEW')
  getById(@Param('id') id: string): Promise<Warehouse> {
    return this.warehouses.getById(id);
  }

  @Post()
  @RequiresPermission('warehouses', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateWarehouseSchema))
    dto: CreateWarehouseDto,
  ): Promise<Warehouse> {
    return this.warehouses.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('warehouses', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWarehouseSchema))
    dto: UpdateWarehouseDto,
  ): Promise<Warehouse> {
    return this.warehouses.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('warehouses', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.warehouses.remove(id);
  }
}
