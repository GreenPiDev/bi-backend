import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { INGEST_QUEUE } from '../../jobs/ingest-queue.constants';
import { DatasourcesController } from './datasources.controller';
import { DatasourcesService } from './datasources.service';
import { FileParserService } from './file-parser.service';
import { TypeInferenceService } from './type-inference.service';

@Module({
  imports: [BullModule.registerQueue({ name: INGEST_QUEUE })],
  controllers: [DatasourcesController],
  providers: [DatasourcesService, FileParserService, TypeInferenceService],
  exports: [FileParserService, TypeInferenceService],
})
export class DatasourcesModule {}
