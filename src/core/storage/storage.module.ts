import { Global, Module } from '@nestjs/common';
import { FileUrlService } from './file-url.service';
import { R2StorageService } from './r2-storage.service';

@Global()
@Module({
  providers: [R2StorageService, FileUrlService],
  exports: [R2StorageService, FileUrlService],
})
export class StorageModule {}
