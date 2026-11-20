import { Module } from '@nestjs/common';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { QuoteTemplatesController } from './quote-templates.controller';
import { QuoteTemplatesService } from './quote-templates.service';

@Module({
  imports: [TenantSettingsModule],
  controllers: [QuoteTemplatesController],
  providers: [QuoteTemplatesService],
  exports: [QuoteTemplatesService],
})
export class QuoteTemplatesModule {}
