import { Module } from '@nestjs/common';
import { DatasetsModule } from '../datasets/datasets.module';
import { TenantsModule } from '../tenants/tenants.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [TenantsModule, DatasetsModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService],
})
export class PlatformAdminModule {}
