import { Module } from '@nestjs/common';
import { TenantProfileCacheService } from './tenant-profile-cache.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, TenantProfileCacheService],
  exports: [TenantsService, TenantProfileCacheService],
})
export class TenantsModule {}
