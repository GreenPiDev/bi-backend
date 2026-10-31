import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../core/prisma/prisma.service';
import { DemoAccountsService } from './demo-accounts.service';

const dto = {
  name: 'Ziyaretci',
  companyName: 'Ornek A.S.',
  email: 'ziyaretci@ornek.com',
  phone: '0555 000 00 00',
  password: 'Sifre1234',
};

function createService(slug: string | undefined) {
  const prisma = {
    tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'tenant-demo' }) },
    role: { findFirst: vi.fn().mockResolvedValue({ id: 'role-admin' }) },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'user-1' }),
    },
  };
  const config = { get: vi.fn().mockReturnValue(slug) };
  const service = new DemoAccountsService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );
  return { service, prisma };
}

describe('DemoAccountsService', () => {
  let ctx: ReturnType<typeof createService>;
  beforeEach(() => {
    ctx = createService('demo');
  });

  it('demo tenantina COMPANYADMIN rolunde demo kullanicisi olusturur', async () => {
    const result = await ctx.service.create(dto);
    expect(result).toEqual({ email: dto.email, tenantSlug: 'demo' });
    expect(ctx.prisma.role.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-demo', isCompanyAdmin: true },
      }),
    );
    const createArgs = ctx.prisma.user.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data).toMatchObject({
      tenantId: 'tenant-demo',
      email: dto.email,
      phone: dto.phone,
      demoCompanyName: dto.companyName,
      isDemoUser: true,
      roles: { create: { roleId: 'role-admin' } },
    });
    // Sure kayitta degil ilk login'de baslar.
    expect(createArgs.data.demoExpiresAt).toBeUndefined();
    expect(createArgs.data.passwordHash).not.toBe(dto.password);
  });

  it('DEMO_TENANT_SLUG yoksa DEMO_SIGNUP_DISABLED firlatir', async () => {
    const { service } = createService(undefined);
    await expect(service.create(dto)).rejects.toMatchObject({
      code: 'DEMO_SIGNUP_DISABLED',
    });
  });

  it('demo tenant bulunamazsa DEMO_SIGNUP_DISABLED firlatir', async () => {
    ctx.prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(ctx.service.create(dto)).rejects.toMatchObject({
      code: 'DEMO_SIGNUP_DISABLED',
    });
  });

  it('e-posta zaten kayitliysa EMAIL_TAKEN firlatir', async () => {
    ctx.prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(ctx.service.create(dto)).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
    });
    expect(ctx.prisma.user.create).not.toHaveBeenCalled();
  });
});
