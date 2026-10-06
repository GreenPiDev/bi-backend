import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Drawing, DrawingPanelTemplate, Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import { autoPackBand, type PackableDevice } from './engine/auto-pack';
import { renderDrawingModel } from './engine/render-svg';
import { parseTemplateLayout } from './engine/template-layout';
import type { DrawingModel, DrawingViewKey } from './engine/types';
import type {
  DrawingPreviewBusbarDto,
  DrawingPreviewItemDto,
  DrawingPreviewRequestDto,
} from './dto/drawing-preview.dto';
import type {
  CreateDrawingDto,
  DrawingQueryDto,
  UpdateDrawingDto,
} from './dto/drawing.dto';

export interface DrawingPreviewResult {
  model: DrawingModel;
  svg: Record<DrawingViewKey, string>;
}

/** Bu kategoriler fiziksel olarak orju plakasinin ARKASINDA kaldigi icin, aksi
 * belirtilmedikce kapak plakali goruntude gizlenir (bkz. docs/VARSAYIMLAR.md V52'deki
 * gercek AG pano referans gorselleri - CT/kondansator ic gorunuste var, orju plakalida yok). */
const CATEGORIES_HIDDEN_IN_COVER_PLATE_BY_DEFAULT = new Set([
  'CT',
  'CAPACITOR',
]);

@Injectable()
export class DrawingsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
  ) {}

  list(query: DrawingQueryDto): Promise<Drawing[]> {
    return this.prisma.drawing.findMany({
      where: query.quoteId ? { quoteId: query.quoteId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findOrThrow(id: string): Promise<Drawing> {
    const drawing = await this.prisma.drawing.findFirst({ where: { id } });
    if (!drawing) {
      throw new AppException(
        'NOT_FOUND',
        'Çizim bulunamadı.',
        HttpStatus.NOT_FOUND,
      );
    }
    return drawing;
  }

  getById(id: string): Promise<Drawing> {
    return this.findOrThrow(id);
  }

  /**
   * D4+D5'in ortak cekirdegi: sablon + item/bara girdisinden deterministik bir
   * DrawingModel kurar (auto-pack). `preview()` bunu hic persist etmeden, `create()`
   * bir Drawing satirina yazarak kullanir - aralarindaki TEK fark budur.
   */
  private async buildModel(
    templateId: string,
    items: readonly DrawingPreviewItemDto[],
    busbarsInput: readonly DrawingPreviewBusbarDto[],
  ): Promise<{ template: DrawingPanelTemplate; model: DrawingModel }> {
    const template = await this.prisma.drawingPanelTemplate.findFirst({
      where: { id: templateId },
    });
    if (!template) {
      throw new AppException(
        'NOT_FOUND',
        'Pano şablonu bulunamadı.',
        HttpStatus.NOT_FOUND,
      );
    }
    const layout = parseTemplateLayout(template.layout);
    const bandKeys = new Set(layout.bands.map((band) => band.key));

    const expandedDevices: {
      device: PackableDevice;
      bandKey: string;
      hiddenInCoverPlate: boolean;
    }[] = [];
    items.forEach((item, itemIndex) => {
      if (!bandKeys.has(item.bandKey)) {
        throw new AppException(
          'UNKNOWN_BAND_KEY',
          `"${item.bandKey}" bu şablonda tanımlı bir bant değil.`,
          HttpStatus.BAD_REQUEST,
        );
      }
      const hiddenInCoverPlate =
        item.hiddenInCoverPlate ??
        CATEGORIES_HIDDEN_IN_COVER_PLATE_BY_DEFAULT.has(item.category);
      for (let i = 0; i < item.quantity; i += 1) {
        expandedDevices.push({
          device: {
            id: `item-${itemIndex}-${i}`,
            libraryComponentKey: item.libraryComponentKey,
            label: item.label,
            category: item.category,
            widthMm: item.widthMm,
            heightMm: item.heightMm,
          },
          bandKey: item.bandKey,
          hiddenInCoverPlate,
        });
      }
    });

    const allElements = layout.bands.flatMap((band) => {
      const devices = expandedDevices
        .filter((entry) => entry.bandKey === band.key)
        .map((entry) => entry.device);
      return autoPackBand(band, devices, layout.clearanceMm);
    });
    const hiddenIdSet = new Set(
      expandedDevices
        .filter((entry) => entry.hiddenInCoverPlate)
        .map((entry) => entry.device.id),
    );

    const busbars = busbarsInput.map((bar, index) => ({
      id: `busbar-${index}`,
      startX: bar.startX,
      startY: bar.startY,
      endX: bar.endX,
      endY: bar.endY,
      thicknessMm: bar.thicknessMm,
      phaseCount: bar.phaseCount,
    }));

    const model: DrawingModel = {
      plateWidthMm: Number(template.widthMm),
      plateHeightMm: Number(template.heightMm),
      views: {
        internal: { elements: allElements },
        coverPlate: {
          elements: allElements.filter((el) => !hiddenIdSet.has(el.id)),
        },
        external: { elements: [] },
      },
      busbars,
    };

    return { template, model };
  }

  /**
   * Faz D4: render/auto-pack motorunu gercek tenant kutuphane/sablon verisiyle
   * salt-okunur onizler - hicbir Drawing/DB satiri yaratmaz.
   */
  async preview(dto: DrawingPreviewRequestDto): Promise<DrawingPreviewResult> {
    const { model } = await this.buildModel(
      dto.templateId,
      dto.items,
      dto.busbars,
    );
    return { model, svg: renderDrawingModel(model) };
  }

  /**
   * Faz D5: preview ile ayni motoru kullanarak bir Quote icin taslak Drawing
   * olusturur ve PERSIST eder - PDF/AI olmadan elle tetiklenen bir yol (gercek PDF
   * pre-processing akisi Faz D6'da gelecek, bkz. docs/VARSAYIMLAR.md V53).
   */
  async create(dto: CreateDrawingDto): Promise<Drawing> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: dto.quoteId },
    });
    if (!quote) {
      throw new AppException(
        'NOT_FOUND',
        'Teklif bulunamadı.',
        HttpStatus.NOT_FOUND,
      );
    }
    const { model } = await this.buildModel(
      dto.templateId,
      dto.items,
      dto.busbars,
    );
    return this.persist(
      dto.quoteId,
      dto.templateId,
      dto.name,
      dto.panelGroupLabel,
      model,
    );
  }

  /**
   * Faz D6: PDF -> AI eslestirme -> kullanici onayi akisinin son adimi
   * (`DrawingImportsService.commit`) tarafindan cagrilir. `create()`'ten farki,
   * itemlarin DrawingPreviewItemDto olarak degil {productId, quantity} olarak
   * gelmesi - buradaki tek is Product + ProductDrawingSpec + DrawingLibraryComponent
   * uclemesinden gercek bir DrawingPreviewItemDto cikarmak (bandKey/libraryComponentKey/
   * olculer Product'tan, category kutuphane kaydindan). Bir urun cizim motorunda
   * kullanilamaz durumdaysa (Teknik Ozellikler eksik) acik bir hata doner - sessizce
   * atlanmaz (bkz. docs/VARSAYIMLAR.md V52 "AI asla uydurmaz" ilkesi, burada motor da
   * uydurmaz).
   */
  async createFromProductSelection(input: {
    quoteId: string;
    templateId: string;
    name: string;
    panelGroupLabel?: string;
    items: readonly { productId: string; quantity: number }[];
  }): Promise<Drawing> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: input.quoteId },
    });
    if (!quote) {
      throw new AppException(
        'NOT_FOUND',
        'Teklif bulunamadı.',
        HttpStatus.NOT_FOUND,
      );
    }

    const resolvedItems: DrawingPreviewItemDto[] = [];
    for (const entry of input.items) {
      const product = await this.prisma.product.findFirst({
        where: { id: entry.productId },
        include: { drawingSpec: true },
      });
      if (!product) {
        throw new AppException(
          'NOT_FOUND',
          'Ürün bulunamadı.',
          HttpStatus.NOT_FOUND,
        );
      }
      const spec = product.drawingSpec;
      if (
        !spec ||
        spec.widthMm == null ||
        spec.heightMm == null ||
        !spec.libraryComponentKey ||
        !spec.bandKey
      ) {
        throw new AppException(
          'PRODUCT_NOT_DRAWABLE',
          `"${product.name}" ürününün Teknik Özellikler bölümü (genişlik/yükseklik/kütüphane komponenti/bant anahtarı) eksik, otomatik çizimde kullanılamaz.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const libraryComponent =
        await this.prisma.drawingLibraryComponent.findFirst({
          where: { key: spec.libraryComponentKey },
        });
      if (!libraryComponent) {
        throw new AppException(
          'UNKNOWN_LIBRARY_COMPONENT',
          `"${product.name}" ürününün bağlı olduğu kütüphane komponenti ("${spec.libraryComponentKey}") bulunamadı.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      resolvedItems.push({
        libraryComponentKey: spec.libraryComponentKey,
        label: product.name,
        category: libraryComponent.category,
        widthMm: Number(spec.widthMm),
        heightMm: Number(spec.heightMm),
        bandKey: spec.bandKey,
        quantity: entry.quantity,
      });
    }

    const { model } = await this.buildModel(
      input.templateId,
      resolvedItems,
      [],
    );
    return this.persist(
      input.quoteId,
      input.templateId,
      input.name,
      input.panelGroupLabel,
      model,
    );
  }

  private async persist(
    quoteId: string,
    templateId: string,
    name: string,
    panelGroupLabel: string | undefined,
    model: DrawingModel,
  ): Promise<Drawing> {
    const { userId } = TenantContext.getOrThrow();
    return this.prisma.drawing.create({
      data: {
        quoteId,
        templateId,
        name,
        panelGroupLabel,
        model: model as unknown as Prisma.InputJsonValue,
        createdById: userId,
      } as never,
    });
  }

  async update(id: string, dto: UpdateDrawingDto): Promise<Drawing> {
    await this.findOrThrow(id);
    return this.prisma.drawing.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.model !== undefined
          ? { model: dto.model as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.drawing.delete({ where: { id } });
  }
}
