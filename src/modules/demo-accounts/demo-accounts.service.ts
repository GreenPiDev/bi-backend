import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppException } from '../../core/errors/app.exception';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { CreateDemoAccountDto } from './dto/create-demo-account.dto';

export interface CreatedDemoAccount {
  email: string;
  /** Kullanicinin login olacagi tenant subdomain'i (orn. "demo"). */
  tenantSlug: string;
}

/**
 * Tanitim sayfasindaki "Demo kullanici olustur" akisi: ziyaretci kendi e-posta/sifresiyle,
 * `DEMO_TENANT_SLUG` env'iyle belirtilen ORTAK demo tenant'ina COMPANYADMIN olarak eklenir.
 * 1 gunluk sure ilk login'de baslar (AuthService.login), kisitlar DemoAccessGuard'da.
 * Istek kimliksiz oldugu icin TenantContext yok - tenant-scoped extension yerine ham
 * PrismaService ile acik tenantId kullanilir (AuthService.register ile ayni desen).
 */
@Injectable()
export class DemoAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateDemoAccountDto): Promise<CreatedDemoAccount> {
    const { tenantId, slug } = await this.resolveDemoTenant();
    const companyAdminRole = await this.prisma.role.findFirst({
      where: { tenantId, isCompanyAdmin: true },
      select: { id: true },
    });
    if (!companyAdminRole) {
      throw this.disabledError();
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw this.emailTakenError();
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    try {
      await this.prisma.user.create({
        data: {
          tenantId,
          email: dto.email,
          name: dto.name,
          phone: dto.phone,
          demoCompanyName: dto.companyName,
          passwordHash,
          isDemoUser: true,
          roles: { create: { roleId: companyAdminRole.id } },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.emailTakenError();
      }
      throw error;
    }
    return { email: dto.email, tenantSlug: slug };
  }

  private async resolveDemoTenant(): Promise<{
    tenantId: string;
    slug: string;
  }> {
    const slug = this.config.get<string>('DEMO_TENANT_SLUG')?.trim();
    if (!slug) {
      throw this.disabledError();
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!tenant) {
      throw this.disabledError();
    }
    return { tenantId: tenant.id, slug };
  }

  private disabledError(): AppException {
    return new AppException(
      'DEMO_SIGNUP_DISABLED',
      'Demo hesabi olusturma su anda kullanilamiyor.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private emailTakenError(): AppException {
    return new AppException(
      'EMAIL_TAKEN',
      'Bu e-posta adresi zaten kullaniliyor.',
      HttpStatus.CONFLICT,
    );
  }
}
