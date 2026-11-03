import { HttpStatus, Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type Redis from 'ioredis';
import { AppException } from '../../core/errors/app.exception';
import { MailService } from '../../core/mail/mail.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { REDIS_CLIENT } from '../../core/redis/redis-client.token';
import {
  PASSWORD_CHANGED_MARKER_TTL_SECONDS,
  PASSWORD_RESET_TTL_MS,
  passwordChangedMarkerKey,
} from './password-reset.constants';

const INVALID_TOKEN_MESSAGE =
  'Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Kullanıcı var olsun ya da olmasın çağıran tarafa aynı sonucu döner (hesap
   * varlığı sızmasın). Asıl iş (token + mail) yanıttan sonra arka planda yürür ki
   * yanıt süresi de kayıtlı/kayıtsız e-postayı ele vermesin.
   */
  requestReset(email: string): void {
    void this.processRequest(email).catch((error: unknown) => {
      this.logger.error(
        `Sifre sifirlama talebi islenemedi: ${
          error instanceof Error ? error.message : 'bilinmeyen hata'
        }`,
      );
    });
  }

  private async processRequest(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { name: true, slug: true } } },
    });
    if (!user || !user.isActive) return;

    const rawToken = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      }),
    ]);

    const baseUrl = this.buildFrontendUrl(
      user.isPlatformAdmin ? null : user.tenant.slug,
    );
    const link = `${baseUrl}/sifre-sifirla/${rawToken}`;
    await this.mail.send({
      to: [user.email],
      subject: 'PiLens şifre sıfırlama',
      text: [
        `Merhaba ${user.name},`,
        '',
        'Hesabınız için bir şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki bağlantıyı kullanabilirsiniz (60 dakika geçerlidir):',
        link,
        '',
        'Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz; şifreniz değişmez.',
      ].join('\n'),
      html: `<p>Merhaba ${escapeHtml(user.name)},</p>
<p>Hesabınız için bir şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki bağlantıyı kullanabilirsiniz (60 dakika geçerlidir):</p>
<p><a href="${link}">Şifremi sıfırla</a></p>
<p>Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz; şifreniz değişmez.</p>`,
    });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt.getTime() < Date.now() ||
      !record.user.isActive
    ) {
      throw new AppException(
        'INVALID_RESET_TOKEN',
        INVALID_TOKEN_MESSAGE,
        HttpStatus.BAD_REQUEST,
      );
    }

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });
    const now = new Date();
    // Tek kullanimlik: updateMany + usedAt:null kosulu, es zamanli iki istekten
    // yalnizca birinin basarili olmasini garanti eder.
    const claimed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (result.count === 0) return false;
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, passwordChangedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
      return true;
    });
    if (!claimed) {
      throw new AppException(
        'INVALID_RESET_TOKEN',
        INVALID_TOKEN_MESSAGE,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.markSessionsRevoked(record.userId, now);
    await this.writeAudit(record.user.tenantId, record.userId);
    void this.sendChangedNotice(record.user.email, record.user.name).catch(
      () => undefined,
    );
  }

  /** Açık access token'ları (en fazla 15 dk yaşar) hemen düşürmek için Redis
   * işareti; Redis erişilemezse refresh tarafındaki DB kontrolü yine devrededir. */
  private async markSessionsRevoked(userId: string, at: Date): Promise<void> {
    try {
      await this.redis.set(
        passwordChangedMarkerKey(userId),
        String(at.getTime()),
        'EX',
        PASSWORD_CHANGED_MARKER_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `Oturum iptal isareti yazilamadi: ${
          error instanceof Error ? error.message : 'bilinmeyen hata'
        }`,
      );
    }
  }

  private async writeAudit(tenantId: string, userId: string): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'password.reset',
          entity: 'user',
          entityId: userId,
        },
      });
    } catch {
      // denetim kaydi basarisizligi sifirlamayi durdurmamali
    }
  }

  private async sendChangedNotice(email: string, name: string): Promise<void> {
    await this.mail.send({
      to: [email],
      subject: 'PiLens şifreniz değiştirildi',
      text: [
        `Merhaba ${name},`,
        '',
        'Hesabınızın şifresi az önce sıfırlandı ve açık oturumlarınız kapatıldı.',
        'Bu işlemi siz yapmadıysanız lütfen hemen yöneticinizle iletişime geçin.',
      ].join('\n'),
    });
  }

  private buildFrontendUrl(tenantSlug: string | null): string {
    const rootDomain = this.config.get<string>('TENANT_ROOT_DOMAIN');
    if (rootDomain && tenantSlug) return `https://${tenantSlug}.${rootDomain}`;
    return this.config.getOrThrow<string>('FRONTEND_URL');
  }
}
