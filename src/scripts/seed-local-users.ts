/**
 * Yerel gelistirme icin temel test hesaplarini olusturur (2026-11-13, yerel DB
 * kaybindan sonra). Tenant'lar uygulamanin kendi akisiyla
 * (TenantsService.createTenantWithAdmin) acilir - roller, Ana Depo, varsayilan
 * secenek listeleri ve anket sablonu boylece eksiksiz kurulur. Opsiyonel moduller
 * (crm, analytics, drawings) PlatformAdminService uzerinden acilir ki rapor
 * dataset'leri ve cizim kutuphanesi de provizyon edilsin.
 *
 * Idempotent: superadmin@test.com zaten varsa hicbir sey yapmadan cikar.
 * Calistirma: npx ts-node -r tsconfig-paths/register src/scripts/seed-local-users.ts
 */
import { NestFactory } from '@nestjs/core';
import * as argon2 from 'argon2';
import { AppModule } from '../app.module';
import { MODULE_REGISTRY } from '../core/modules/module-registry';
import { PrismaService } from '../core/prisma/prisma.service';
import { RealtimeService } from '../core/realtime/realtime.service';
import { PlatformAdminService } from '../modules/platform-admin/platform-admin.service';
import { TenantsService } from '../modules/tenants/tenants.service';

const PASSWORD = 'Deneme123!';

interface TenantSeed {
  tenantName: string;
  adminName: string;
  adminEmail: string;
  enableModules: boolean;
}

const PLATFORM_TENANT: TenantSeed = {
  tenantName: 'Platform Yönetimi',
  adminName: 'Süper Admin',
  adminEmail: 'superadmin@test.com',
  enableModules: false,
};

const COMPANY_TENANTS: TenantSeed[] = [
  {
    tenantName: 'Test Şirketi',
    adminName: 'Test Admin',
    adminEmail: 'companyadmin@test.com',
    enableModules: true,
  },
  {
    tenantName: 'Kolpa Şirketi',
    adminName: 'Kolpa Admin',
    adminEmail: 'kolpasirket@kolpa.com',
    enableModules: true,
  },
];

const BASIC_USER = {
  tenantName: 'Test Şirketi',
  name: 'Temel Kullanıcı',
  email: 'temelkullanici@test.com',
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const tenants = app.get(TenantsService);
    const platformAdmin = app.get(PlatformAdminService);
    const realtime = app.get(RealtimeService);
    realtime.emitToTenant = () => undefined;
    realtime.emitToAll = () => undefined;

    if (
      await prisma.user.findUnique({
        where: { email: PLATFORM_TENANT.adminEmail },
      })
    ) {
      console.log('Test hesaplari zaten var - cikiliyor.');
      return;
    }

    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const tenantIdByName = new Map<string, string>();

    for (const seed of [PLATFORM_TENANT, ...COMPANY_TENANTS]) {
      const { tenant } = await tenants.createTenantWithAdmin({
        tenantName: seed.tenantName,
        adminName: seed.adminName,
        adminEmail: seed.adminEmail,
      });
      tenantIdByName.set(seed.tenantName, tenant.id);
      // Gecici sifre yerine sabit test sifresi.
      await prisma.user.update({
        where: { email: seed.adminEmail },
        data: {
          passwordHash,
          isPlatformAdmin: seed === PLATFORM_TENANT,
        },
      });
      if (seed.enableModules) {
        for (const module of MODULE_REGISTRY.filter((item) => !item.alwaysOn)) {
          await platformAdmin.setTenantModule(tenant.id, module.key, true);
        }
      }
      console.log(
        `Tenant: ${seed.tenantName} (${tenant.id}) -> ${seed.adminEmail}`,
      );
    }

    const basicTenantId = tenantIdByName.get(BASIC_USER.tenantName) as string;
    const basicRole = await prisma.role.findFirstOrThrow({
      where: { tenantId: basicTenantId, isBasic: true },
    });
    await prisma.user.create({
      data: {
        tenantId: basicTenantId,
        email: BASIC_USER.email,
        name: BASIC_USER.name,
        passwordHash,
        roles: { create: { roleId: basicRole.id } },
      },
    });
    console.log(
      `Temel kullanici: ${BASIC_USER.email} (${BASIC_USER.tenantName})`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
