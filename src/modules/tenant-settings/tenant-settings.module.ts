import { Module } from '@nestjs/common';
import { TenantSettingsController } from './tenant-settings.controller';
import { TenantSettingsService } from './tenant-settings.service';

@Module({
  controllers: [TenantSettingsController],
  providers: [TenantSettingsService],
  exports: [TenantSettingsService],
})
export class TenantSettingsModule {}
