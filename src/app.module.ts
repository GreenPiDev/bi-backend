import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './core/core.module';
import { JwtAuthGuard } from './core/guards/jwt-auth.guard';
import { ModuleGuard } from './core/guards/module.guard';
import { PermissionGuard } from './core/guards/permission.guard';
import { TenantContextInterceptor } from './core/interceptors/tenant-context.interceptor';
import { PageModulesModule } from './core/modules/page-modules.module';
import { PermissionsModule } from './core/permissions/permissions.module';
import { RealtimeModule } from './core/realtime/realtime.module';
import { RedisModule } from './core/redis/redis.module';
import { JobsModule } from './jobs/jobs.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CalendarEventsModule } from './modules/calendar-events/calendar-events.module';
import { CalendarSharesModule } from './modules/calendar-shares/calendar-shares.module';
import { CacheModule } from './modules/cache/cache.module';
import { ChatbotModule } from './modules/chatbot/chatbot.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { DatasetsModule } from './modules/datasets/datasets.module';
import { DatasourcesModule } from './modules/datasources/datasources.module';
import { DepartmentOptionsModule } from './modules/department-options/department-options.module';
import { DrawingLibraryModule } from './modules/drawing-library/drawing-library.module';
import { DrawingTemplatesModule } from './modules/drawing-templates/drawing-templates.module';
import { DrawingsModule } from './modules/drawings/drawings.module';
import { DrawingImportsModule } from './modules/drawing-imports/drawing-imports.module';
import { ExportsModule } from './modules/exports/exports.module';
import { FilesModule } from './modules/files/files.module';
import { IbanOptionsModule } from './modules/iban-options/iban-options.module';
import { ImportsModule } from './modules/imports/imports.module';
import { InteractionImportsModule } from './modules/interaction-imports/interaction-imports.module';
import { InteractionsModule } from './modules/interactions/interactions.module';
import { InteractionTypeOptionsModule } from './modules/interaction-type-options/interaction-type-options.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { PaymentMethodOptionsModule } from './modules/payment-method-options/payment-method-options.module';
import { PostSaleCasesModule } from './modules/post-sale-cases/post-sale-cases.module';
import { ProductCategoriesModule } from './modules/product-categories/product-categories.module';
import { BrandOptionsModule } from './modules/brand-options/brand-options.module';
import { UnitOptionsModule } from './modules/unit-options/unit-options.module';
import { ProductImportsModule } from './modules/product-imports/product-imports.module';
import { ProductListsModule } from './modules/product-lists/product-lists.module';
import { ProductsModule } from './modules/products/products.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { QueryModule } from './modules/query/query.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { QuoteImportsModule } from './modules/quote-imports/quote-imports.module';
import { QuoteTemplatesModule } from './modules/quote-templates/quote-templates.module';
import { ReminderTypeOptionsModule } from './modules/reminder-type-options/reminder-type-options.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { SectorOptionsModule } from './modules/sector-options/sector-options.module';
import { StockItemsModule } from './modules/stock-items/stock-items.module';
import { TenantSettingsModule } from './modules/tenant-settings/tenant-settings.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { TitleOptionsModule } from './modules/title-options/title-options.module';
import { UsersModule } from './modules/users/users.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
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
    RealtimeModule,
    PermissionsModule,
    PageModulesModule,
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
    FilesModule,
    ReportsModule,
    AlertsModule,
    ChatbotModule,
    AccountsModule,
    ContactsModule,
    ImportsModule,
    CacheModule,
    SectorOptionsModule,
    DepartmentOptionsModule,
    TitleOptionsModule,
    ProductCategoriesModule,
    BrandOptionsModule,
    UnitOptionsModule,
    PaymentMethodOptionsModule,
    IbanOptionsModule,
    TenantSettingsModule,
    CalendarEventsModule,
    CalendarSharesModule,
    ReminderTypeOptionsModule,
    InteractionsModule,
    InteractionImportsModule,
    InteractionTypeOptionsModule,
    OpportunitiesModule,
    ProductListsModule,
    ProductsModule,
    ProductImportsModule,
    QuotesModule,
    QuoteImportsModule,
    QuoteTemplatesModule,
    PostSaleCasesModule,
    ProjectsModule,
    PurchaseOrdersModule,
    StockItemsModule,
    WarehousesModule,
    MessagesModule,
    NotificationsModule,
    DrawingsModule,
    DrawingImportsModule,
    DrawingLibraryModule,
    DrawingTemplatesModule,
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
