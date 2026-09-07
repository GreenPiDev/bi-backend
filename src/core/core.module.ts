import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [PrismaModule, MailModule, StorageModule],
  controllers: [HealthController],
})
export class CoreModule {}
