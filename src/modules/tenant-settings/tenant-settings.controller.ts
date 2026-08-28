import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  UpdateTenantSettingSchema,
  type TenantSettingResponse,
  type UpdateTenantSettingDto,
} from './dto/tenant-setting.dto';
import { TenantSettingsService } from './tenant-settings.service';

@RequiresModule('crm')
@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private readonly settings: TenantSettingsService) {}

  @Get()
  list(): Promise<TenantSettingResponse[]> {
    return this.settings.list();
  }

  @Get(':key')
  get(@Param('key') key: string): Promise<TenantSettingResponse> {
    return this.settings.get(key);
  }

  @Patch(':key')
  @RequiresPermission('settings', 'UPDATE')
  update(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(UpdateTenantSettingSchema))
    dto: UpdateTenantSettingDto,
  ): Promise<TenantSettingResponse> {
    return this.settings.upsert(key, dto.value);
  }
}
