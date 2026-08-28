import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './core/core.module';
import { JwtAuthGuard } from './core/guards/jwt-auth.guard';
import { ModuleGuard } from './core/guards/module.guard';
import { PermissionGuard } from './core/guards/permission.guard';
import { TenantContextInterceptor } from './core/interceptors/tenant-context.interceptor';
import { PermissionsModule } from './core/permissions/permissions.module';
import { RedisModule } from './core/redis/redis.module';
import { JobsModule } from './jobs/jobs.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatbotModule } from './modules/chatbot/chatbot.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { DatasetsModule } from './modules/datasets/datasets.module';
import { DatasourcesModule } from './modules/datasources/datasources.module';
import { ExportsModule } from './modules/exports/exports.module';
import { ImportsModule } from './modules/imports/imports.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { QueryModule } from './modules/query/query.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { SectorOptionsModule } from './modules/sector-options/sector-options.module';
import { TenantSettingsModule } from './modules/tenant-settings/tenant-settings.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { WidgetsModule } from './modules/widgets/widgets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    CoreModule,
    RedisModule,
    PermissionsModule,
    AuditModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    RolesModule,
    PlatformAdminModule,
    DatasourcesModule,
    DatasetsModule,
    QueryModule,
    DashboardsModule,
    WidgetsModule,
    OnboardingModule,
    ExportsModule,
    ReportsModule,
    AlertsModule,
    ChatbotModule,
    AccountsModule,
    ContactsModule,
    ImportsModule,
    SectorOptionsModule,
    TenantSettingsModule,
    JobsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: ModuleGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
