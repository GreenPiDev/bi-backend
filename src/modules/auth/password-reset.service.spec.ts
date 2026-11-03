import { ConfigService } from '@nestjs/config';
import { AppException } from '../../core/errors/app.exception';
import { PasswordResetService } from './password-reset.service';

function createService(overrides: { token?: unknown; user?: unknown }): {
  service: PasswordResetService;
  send: ReturnType<typeof vi.fn>;
  tokenCreate: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn().mockResolvedValue(undefined);
  const tokenCreate = vi.fn().mockResolvedValue({});
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(overrides.user ?? null) },
    passwordResetToken: {
      findUnique: vi.fn().mockResolvedValue(overrides.token ?? null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: tokenCreate,
    },
    $transaction: vi.fn().mockResolvedValue([]),
    auditLog: { create: vi.fn() },
  };
  const config = {
    get: vi.fn().mockReturnValue(undefined),
    getOrThrow: vi.fn().mockReturnValue('http://localhost:5173'),
  } as unknown as ConfigService;
  const redis = { set: vi.fn() };
  const service = new PasswordResetService(
    prisma as never,
    { send } as never,
    config,
    redis as never,
  );
  return { service, send, tokenCreate };
}

describe('PasswordResetService', () => {
  it('kayitsiz e-posta icin mail gondermez', async () => {
    const { service, send } = createService({});
    service.requestReset('yok@example.com');
    await new Promise((r) => setTimeout(r, 10));
    expect(send).not.toHaveBeenCalled();
  });

  it('kayitli aktif kullanici icin baglanti iceren mail gonderir', async () => {
    const { service, send } = createService({
      user: {
        id: 'u1',
        email: 'a@example.com',
        name: 'Ali',
        isActive: true,
        isPlatformAdmin: false,
        tenant: { name: 'T', slug: 't' },
      },
    });
    service.requestReset('a@example.com');
    await new Promise((r) => setTimeout(r, 10));
    expect(send).toHaveBeenCalledTimes(1);
    const input = send.mock.calls[0][0] as { text: string; to: string[] };
    expect(input.to).toEqual(['a@example.com']);
    expect(input.text).toContain('http://localhost:5173/sifre-sifirla/');
  });

  it('pasif kullanici icin mail gondermez', async () => {
    const { service, send } = createService({
      user: {
        id: 'u1',
        email: 'a@example.com',
        name: 'Ali',
        isActive: false,
        isPlatformAdmin: false,
        tenant: { name: 'T', slug: 't' },
      },
    });
    service.requestReset('a@example.com');
    await new Promise((r) => setTimeout(r, 10));
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['bulunamayan', undefined],
    [
      'kullanilmis',
      {
        id: 't',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 1e6),
        user: { isActive: true },
      },
    ],
    [
      'suresi dolmus',
      {
        id: 't',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: { isActive: true },
      },
    ],
  ])('%s token INVALID_RESET_TOKEN firlatir', async (_label, token) => {
    const { service } = createService({ token });
    await expect(
      service.resetPassword('x'.repeat(30), 'yeniSifre123'),
    ).rejects.toMatchObject({ code: 'INVALID_RESET_TOKEN' });
    await expect(
      service.resetPassword('x'.repeat(30), 'yeniSifre123'),
    ).rejects.toBeInstanceOf(AppException);
  });
});
