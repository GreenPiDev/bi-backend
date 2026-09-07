import { Module } from '@nestjs/common';
import { QueryModule } from '../query/query.module';
import { CrmReportProvisioningService } from './crm-report-provisioning.service';
import { DatasetsController } from './datasets.controller';
import { DatasetsService } from './datasets.service';

@Module({
  imports: [QueryModule],
  controllers: [DatasetsController],
  providers: [DatasetsService, CrmReportProvisioningService],
  exports: [DatasetsService, CrmReportProvisioningService],
})
export class DatasetsModule {}
