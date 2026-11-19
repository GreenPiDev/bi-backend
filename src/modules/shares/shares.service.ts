import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Share, ShareResourceType } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { R2StorageService } from '../../core/storage/r2-storage.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ShareFile {
  buffer: Buffer;
  /** Uzantili, indirilecek dosya adi (orn. `TEK-2026-11-19-001-ACME.pdf`). */
  fileName: string;
  contentType: string;
}

export interface CreateFileShareInput {
  resourceType: ShareResourceType;
  resourceId: string;
  title: string;
  file: ShareFile;
  expiresInDays: number | null;
}

export interface ShareView {
  id: string;
  url: string;
  title: string;
  fileName: string;
  expiresAt: string | null;
  revokedAt: string | null;
  isActive: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  createdByName: string;
}

type ShareWithCreator = Share & { createdBy: { name: string } };

export function isShareActive(
  share: Pick<Share, 'revokedAt' | 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  if (share.revokedAt) return false;
  return !share.expiresAt || share.expiresAt.getTime() > now.getTime();
}

/**
 * Merkezi paylasim linki servisi (bkz. docs/VARSAYIMLAR.md V87). Kaynak tipinden
 * (teklif vb.) habersizdir: dosyayi uretmek ve yetki kontrolu cagiran modulun
 * isidir (orn. exports/quote-shares.controller.ts), bu servis sadece snapshot'i
 * R2'ye yazar, link kaydini tutar ve iptal eder.
 */
@Injectable()
export class SharesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly storage: R2StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async createFileShare(input: CreateFileShareInput): Promise<ShareView> {
    const { tenantId, userId } = TenantContext.getOrThrow();
    const token = randomBytes(24).toString('base64url');
    const env =
      process.env.NODE_ENV === 'production' ? 'production' : 'development';
    const fileKey = `PILENS/${env}/${tenantId}/shares/${token}`;
    await this.storage.upload(
      fileKey,
      input.file.buffer,
      input.file.contentType,
    );

    const share = await this.prisma.share.create({
      data: {
        tenantId,
        token,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        title: input.title,
        fileKey,
        fileName: input.file.fileName,
        contentType: input.file.contentType,
        expiresAt:
          input.expiresInDays === null
            ? null
            : new Date(Date.now() + input.expiresInDays * DAY_MS),
        createdById: userId,
      },
      include: { createdBy: { select: { name: true } } },
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'Share',
      entityId: share.id,
      meta: { resourceType: input.resourceType, resourceId: input.resourceId },
    });
    return this.toView(share);
  }

  async listForResource(
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<ShareView[]> {
    const shares = await this.prisma.share.findMany({
      where: { resourceType, resourceId },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return shares.map((share) => this.toView(share));
  }

  /** Linki iptal eder (kayit ve R2 dosyasi silinmez - goruntulenme gecmisi
   * kalsin diye, sadece `revokedAt` setlenir). Baska kaynaga ait veya baska
   * tenant'in share id'si 404 doner. */
  async revoke(
    resourceType: ShareResourceType,
    resourceId: string,
    shareId: string,
  ): Promise<ShareView> {
    const existing = await this.prisma.share.findFirst({
      where: { id: shareId, resourceType, resourceId },
    });
    if (!existing) {
      throw new AppException(
        'SHARE_NOT_FOUND',
        'Paylasim linki bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const share = await this.prisma.share.update({
      where: { id: shareId },
      data: { revokedAt: existing.revokedAt ?? new Date() },
      include: { createdBy: { select: { name: true } } },
    });
    await this.audit.log({
      action: 'REVOKE',
      entity: 'Share',
      entityId: share.id,
    });
    return this.toView(share);
  }

  private toView(share: ShareWithCreator): ShareView {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    return {
      id: share.id,
      url: `${frontendUrl.replace(/\/$/, '')}/paylasim/${share.token}`,
      title: share.title,
      fileName: share.fileName,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      revokedAt: share.revokedAt?.toISOString() ?? null,
      isActive: isShareActive(share),
      viewCount: share.viewCount,
      lastViewedAt: share.lastViewedAt?.toISOString() ?? null,
      createdAt: share.createdAt.toISOString(),
      createdByName: share.createdBy.name,
    };
  }
}
