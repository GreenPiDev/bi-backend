import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatasourcesModule } from '../modules/datasources/datasources.module';
import { IngestDatasourceProcessor } from './ingest-datasource.processor';
import { INGEST_QUEUE } from './ingest-queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>('REDIS_URL') },
      }),
    }),
    BullModule.registerQueue({ name: INGEST_QUEUE }),
    DatasourcesModule,
  ],
  providers: [IngestDatasourceProcessor],
})
export class JobsModule {}
