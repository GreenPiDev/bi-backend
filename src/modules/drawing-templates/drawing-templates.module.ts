import { Module } from '@nestjs/common';
import { DrawingTemplatesProvisioningService } from './drawing-templates-provisioning.service';
import { DrawingTemplatesController } from './drawing-templates.controller';
import { DrawingTemplatesService } from './drawing-templates.service';

@Module({
  controllers: [DrawingTemplatesController],
  providers: [DrawingTemplatesService, DrawingTemplatesProvisioningService],
  exports: [DrawingTemplatesService, DrawingTemplatesProvisioningService],
})
export class DrawingTemplatesModule {}
