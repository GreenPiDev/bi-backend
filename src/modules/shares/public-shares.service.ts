import { HttpStatus, Injectable } from '@nestjs/common';
import type { Share } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  R2StorageService,
  type DownloadedFile,
} from '../../core/storage/r2-storage.service';
import { isShareActive } from './shares.service';

export interface PublicShareView {
  title: string;
  fileName: string;
  tenantName: string;
  /** `data:` URI - public sayfa kimlik dogrulamasiz oldugu icin auth gerektiren
   * /files proxy URL'i kullanilamaz (public-surveys ile ayni gerekce). */
  tenantLogoDataUrl: string | null;
  sharedByName: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface PublicShareFile {
  file: DownloadedFile;
  fileName: string;
  contentType: string;
}

/**
 * Kimlik dogrulamasiz paylasim linki uclari (bkz. docs/VARSAYIMLAR.md V87).
 * @Public() oldugu icin TenantContext kurulmaz - ham PrismaService kullanilir
 * (public-surveys ile ayni bypass deseni). Token globally unique ve 192 bit
 * rastgele oldugundan tenant filtresine ihtiyac yok.
 */
@Injectable()
export class PublicSharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
  ) {}

  async getByToken(token: string): Promise<PublicShareView> {
    const share = await this.findActiveOrThrow(token);
    const [tenant, creator] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: share.tenantId } }),
      this.prisma.user.findUnique({
        where: { id: share.createdById },
        select: { name: true },
      }),
    ]);
    return {
      title: share.title,
      fileName: share.fileName,
      tenantName: tenant.name,
      tenantLogoDataUrl: await this.loadLogoDataUrl(tenant.logoKey),
      sharedByName: creator?.name ?? '',
      createdAt: share.createdAt.toISOString(),
      expiresAt: share.expiresAt?.toISOString() ?? null,
    };
  }

  /** Dosyayi R2'den akitir ve goruntulenme sayacini arttirir. */
  async openFile(token: string): Promise<PublicShareFile> {
    const share = await this.findActiveOrThrow(token);
    const file = await this.storage.download(share.fileKey);
    await this.prisma.share.update({
      where: { id: share.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
    return {
      file,
      fileName: share.fileName,
      contentType: share.contentType,
    };
  }

  private async findActiveOrThrow(token: string): Promise<Share> {
    const share = await this.prisma.share.findUnique({ where: { token } });
    if (!share) {
      throw new AppException(
        'SHARE_NOT_FOUND',
        'Bu paylasim linki gecersiz.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!isShareActive(share)) {
      throw new AppException(
        share.revokedAt ? 'SHARE_REVOKED' : 'SHARE_EXPIRED',
        share.revokedAt
          ? 'Bu paylasim linki iptal edilmis.'
          : 'Bu paylasim linkinin suresi dolmus.',
        HttpStatus.GONE,
      );
    }
    return share;
  }

  private async loadLogoDataUrl(
    logoKey: string | null,
  ): Promise<string | null> {
    if (!logoKey) return null;
    try {
      const file = await this.storage.download(logoKey);
      const chunks: Buffer[] = [];
      for await (const chunk of file.body) {
        chunks.push(chunk as Buffer);
      }
      const base64 = Buffer.concat(chunks).toString('base64');
      return `data:${file.contentType ?? 'image/png'};base64,${base64}`;
    } catch {
      return null;
    }
  }
}
