import { Global, Module } from '@nestjs/common';
import { PageModulesService } from './page-modules.service';

@Global()
@Module({
  providers: [PageModulesService],
  exports: [PageModulesService],
})
export class PageModulesModule {}
