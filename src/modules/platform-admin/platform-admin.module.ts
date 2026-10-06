import { Module } from '@nestjs/common';
import { DatasetsModule } from '../datasets/datasets.module';
import { DrawingLibraryModule } from '../drawing-library/drawing-library.module';
import { DrawingTemplatesModule } from '../drawing-templates/drawing-templates.module';
import { TenantsModule } from '../tenants/tenants.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [
    TenantsModule,
    DatasetsModule,
    DrawingLibraryModule,
    DrawingTemplatesModule,
  ],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService],
})
export class PlatformAdminModule {}
