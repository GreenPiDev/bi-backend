import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { QuoteTemplate } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { findIdsByTurkishSearch } from '../../core/db/turkish-search';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { FileUrlService } from '../../core/storage/file-url.service';
import { R2StorageService } from '../../core/storage/r2-storage.service';
import { detectImageExtension } from '../../core/validators/image-upload-validation';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  CreateQuoteTemplateDto,
  QuoteTemplateQueryDto,
  UpdateQuoteTemplateDto,
} from './dto/quote-template.dto';

const SORTABLE_FIELDS = ['name', 'createdAt'] as const;

export interface QuoteTemplateImageUrls {
  logoUrl: string | null;
  coverImageUrl: string | null;
  closingImageUrl: string | null;
}

export type QuoteTemplateResponse = QuoteTemplate & QuoteTemplateImageUrls;

type ImageSlot = 'logoKey' | 'coverImageKey' | 'closingImageKey';

const IMAGE_SLOT_FOLDER: Record<ImageSlot, string> = {
  logoKey: 'logo',
  coverImageKey: 'cover',
  closingImageKey: 'closing',
};

/**
 * Ad-hoc: markali teklif PDF sablonu yonetimi (bkz. docs/VARSAYIMLAR.md V41).
 * isDefault tekilligi, transaction icinde digerlerini once false yapan desenle
 * saglanir (WarehousesService ile ayni desen).
 */
@Injectable()
export class QuoteTemplatesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly storage: R2StorageService,
    private readonly fileUrl: FileUrlService,
  ) {}

  private async emitUpdated(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const templates = await this.prisma.quoteTemplate.findMany({
      orderBy: { name: 'asc' },
    });
    this.realtime.emitToTenant(tenantId, 'quoteTemplates.updated', templates);
  }

  private toResponse(template: QuoteTemplate): QuoteTemplateResponse {
    return {
      ...template,
      logoUrl: this.fileUrl.build(template.logoKey, template.updatedAt),
      coverImageUrl: this.fileUrl.build(
        template.coverImageKey,
        template.updatedAt,
      ),
      closingImageUrl: this.fileUrl.build(
        template.closingImageKey,
        template.updatedAt,
      ),
    };
  }

  async list(
    query: QuoteTemplateQueryDto,
  ): Promise<PagedResult<QuoteTemplateResponse>> {
    const { page, pageSize, q } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'name',
      direction: 'asc',
    });

    // Postgres'in bu projede LC_CTYPE=C olmasi yuzunden `contains`/`mode: 'insensitive'`
    // Turkce aksanli karakterlerde (Ü, Ö, Ş, Ç, İ/ı) yanlis sonuc veriyor - bkz.
    // core/db/turkish-search.ts.
    const matchingIds = q
      ? await findIdsByTurkishSearch(
          this.prisma,
          'crm_quote_templates',
          ['name'],
          q,
        )
      : null;

    const where = {
      ...(matchingIds ? { id: { in: matchingIds } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.quoteTemplate.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
      }),
      this.prisma.quoteTemplate.count({ where }),
    ]);

    return {
      data: data.map((template) => this.toResponse(template)),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  private async findByIdOrThrow(id: string): Promise<QuoteTemplate> {
    const template = await this.prisma.quoteTemplate.findFirst({
      where: { id },
    });
    if (!template) {
      throw new AppException(
        'NOT_FOUND',
        'Teklif sablonu bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return template;
  }

  async getById(id: string): Promise<QuoteTemplateResponse> {
    return this.toResponse(await this.findByIdOrThrow(id));
  }

  async create(
    createdById: string,
    dto: CreateQuoteTemplateDto,
  ): Promise<QuoteTemplateResponse> {
    const isDefault = dto.isDefault ?? false;
    const template = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.quoteTemplate.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.quoteTemplate.create({
        data: { ...dto, isDefault, createdById } as never,
      });
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'QuoteTemplate',
      entityId: template.id,
      meta: { name: template.name },
    });
    await this.emitUpdated();
    return this.toResponse(template);
  }

  async update(
    id: string,
    dto: UpdateQuoteTemplateDto,
  ): Promise<QuoteTemplateResponse> {
    await this.findByIdOrThrow(id);
    const template = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.quoteTemplate.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.quoteTemplate.update({
        where: { id },
        data: dto,
      });
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'QuoteTemplate',
      entityId: id,
    });
    await this.emitUpdated();
    return this.toResponse(template);
  }

  async setDefault(id: string): Promise<QuoteTemplateResponse> {
    await this.findByIdOrThrow(id);
    const template = await this.prisma.$transaction(async (tx) => {
      await tx.quoteTemplate.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      return tx.quoteTemplate.update({
        where: { id },
        data: { isDefault: true },
      });
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'QuoteTemplate',
      entityId: id,
      meta: { setDefault: true },
    });
    await this.emitUpdated();
    return this.toResponse(template);
  }

  async remove(id: string): Promise<void> {
    const template = await this.findByIdOrThrow(id);
    for (const key of [
      template.logoKey,
      template.coverImageKey,
      template.closingImageKey,
    ]) {
      if (key) {
        await this.storage.delete(key);
      }
    }
    // onDelete: SetNull - bu sablonu kullanan teklifler sessizce sablonsuz
    // (sade) export'a duser (bkz. docs/VARSAYIMLAR.md V41).
    await this.prisma.quoteTemplate.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'QuoteTemplate',
      entityId: id,
    });
    await this.emitUpdated();
  }

  /** 3 gorsel alani (logo/kapak/kapanis) icin ortak yukleme mantigi - tenants.service.ts
   * uploadLogo ile ayni desen (bkz. o dosya). */
  private async uploadImage(
    id: string,
    slot: ImageSlot,
    file: { mimetype: string; buffer: Buffer },
  ): Promise<QuoteTemplateResponse> {
    const { tenantId } = TenantContext.getOrThrow();
    const template = await this.findByIdOrThrow(id);
    const ext = detectImageExtension(file.mimetype, file.buffer);
    const env =
      process.env.NODE_ENV === 'production' ? 'production' : 'development';
    const key = `PILENS/${env}/${tenantId}/quote-templates/${id}/${IMAGE_SLOT_FOLDER[slot]}.${ext}`;

    await this.storage.upload(key, file.buffer, file.mimetype);
    const existingKey = template[slot];
    if (existingKey && existingKey !== key) {
      await this.storage.delete(existingKey);
    }
    const updated = await this.prisma.quoteTemplate.update({
      where: { id },
      data: { [slot]: key },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'QuoteTemplate',
      entityId: id,
      meta: { [`${slot}Uploaded`]: true },
    });
    await this.emitUpdated();
    return this.toResponse(updated);
  }

  private async removeImage(
    id: string,
    slot: ImageSlot,
  ): Promise<QuoteTemplateResponse> {
    const template = await this.findByIdOrThrow(id);
    const existingKey = template[slot];
    if (existingKey) {
      await this.storage.delete(existingKey);
    }
    const updated = await this.prisma.quoteTemplate.update({
      where: { id },
      data: { [slot]: null },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'QuoteTemplate',
      entityId: id,
      meta: { [`${slot}Removed`]: true },
    });
    await this.emitUpdated();
    return this.toResponse(updated);
  }

  uploadLogo(id: string, file: { mimetype: string; buffer: Buffer }) {
    return this.uploadImage(id, 'logoKey', file);
  }
  removeLogo(id: string) {
    return this.removeImage(id, 'logoKey');
  }
  uploadCoverImage(id: string, file: { mimetype: string; buffer: Buffer }) {
    return this.uploadImage(id, 'coverImageKey', file);
  }
  removeCoverImage(id: string) {
    return this.removeImage(id, 'coverImageKey');
  }
  uploadClosingImage(id: string, file: { mimetype: string; buffer: Buffer }) {
    return this.uploadImage(id, 'closingImageKey', file);
  }
  removeClosingImage(id: string) {
    return this.removeImage(id, 'closingImageKey');
  }
}
