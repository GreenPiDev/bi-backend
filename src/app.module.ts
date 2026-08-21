import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './core/core.module';
import { JwtAuthGuard } from './core/guards/jwt-auth.guard';
import { ModuleGuard } from './core/guards/module.guard';
import { RolesGuard } from './core/guards/roles.guard';
import { TenantContextInterceptor } from './core/interceptors/tenant-context.interceptor';
import { JobsModule } from './jobs/jobs.module';
import { AuthModule } from './modules/auth/auth.module';
import { DatasetsModule } from './modules/datasets/datasets.module';
import { DatasourcesModule } from './modules/datasources/datasources.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    CoreModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    PlatformAdminModule,
    DatasourcesModule,
    DatasetsModule,
    JobsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ModuleGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
