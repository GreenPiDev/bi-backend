import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import type { SectorOption } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateSectorOptionSchema,
  type CreateSectorOptionDto,
} from './dto/sector-option.dto';
import { SectorOptionsService } from './sector-options.service';

@RequiresModule('crm')
@Controller('sector-options')
export class SectorOptionsController {
  constructor(private readonly sectorOptions: SectorOptionsService) {}

  @Get()
  list(): Promise<SectorOption[]> {
    return this.sectorOptions.list();
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(
    @Body(new ZodValidationPipe(CreateSectorOptionSchema))
    dto: CreateSectorOptionDto,
  ): Promise<SectorOption> {
    return this.sectorOptions.create(dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.sectorOptions.remove(id);
  }
}
