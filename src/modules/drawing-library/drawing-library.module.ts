import { Module } from '@nestjs/common';
import { DrawingLibraryProvisioningService } from './drawing-library-provisioning.service';
import { DrawingLibraryController } from './drawing-library.controller';
import { DrawingLibraryService } from './drawing-library.service';

@Module({
  controllers: [DrawingLibraryController],
  providers: [DrawingLibraryService, DrawingLibraryProvisioningService],
  exports: [DrawingLibraryService, DrawingLibraryProvisioningService],
})
export class DrawingLibraryModule {}
