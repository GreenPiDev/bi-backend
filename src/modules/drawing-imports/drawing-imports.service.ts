import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Drawing } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { DrawingsService } from '../drawings/drawings.service';
import { AiLineMatcherService } from './ai-line-matcher.service';
import type { DrawingImportCommitDto } from './dto/drawing-import.dto';
import { PdfTextExtractorService } from './pdf-text-extractor.service';

/** Bu confidence esiginin altindaki satirlar, productId dolu olsa da kullaniciya
 * onay/duzeltme icin isaretlenir (bkz. docs/VARSAYIMLAR.md V52, product-imports'taki
 * "satir bazli hata/onay" deseniyle ayni). */
const CONFIDENCE_REVIEW_THRESHOLD = 0.6;

export interface DrawingImportSuggestedLineResult {
  rawLine: string;
  panelGroupLabel: string;
  productId: string | null;
  productName: string | null;
  quantity: number;
  confidence: number;
  needsReview: boolean;
}

export interface DrawingImportPreviewResult {
  lines: DrawingImportSuggestedLineResult[];
}

@Injectable()
export class DrawingImportsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly pdfTextExtractor: PdfTextExtractorService,
    private readonly aiLineMatcher: AiLineMatcherService,
    private readonly drawingsService: DrawingsService,
  ) {}

  /**
   * Faz D6: PDF -> metin -> AI satir eslemesi. Hicbir sey persist etmez - sadece
   * kullaniciya onay ekraninda gosterilecek oneri listesi doner (bkz.
   * docs/VARSAYIMLAR.md V52 "AI ciktisi her zaman insan onayina sunulur" kurali).
   */
  async previewFromPdf(
    quoteId: string,
    pdfBuffer: Buffer,
  ): Promise<DrawingImportPreviewResult> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId },
    });
    if (!quote) {
      throw new AppException(
        'NOT_FOUND',
        'Teklif bulunamadı.',
        HttpStatus.NOT_FOUND,
      );
    }

    const text = await this.pdfTextExtractor.extractText(pdfBuffer);

    const products = await this.prisma.product.findMany({
      include: { drawingSpec: true },
    });
    const drawableProducts = products.filter(
      (p) =>
        p.drawingSpec &&
        p.drawingSpec.widthMm != null &&
        p.drawingSpec.heightMm != null &&
        p.drawingSpec.libraryComponentKey &&
        p.drawingSpec.bandKey,
    );
    if (drawableProducts.length === 0) {
      throw new AppException(
        'NO_DRAWABLE_PRODUCTS',
        'Hiçbir ürün otomatik pano çizim motorunda kullanılabilir durumda değil (Teknik Özellikler eksik). Önce ürünlerin genişlik/yükseklik/bant anahtarı/kütüphane komponenti bilgilerini doldurun.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const suggestions = await this.aiLineMatcher.matchLines(
      text,
      drawableProducts.map((p) => ({ id: p.id, name: p.name, sku: p.sku })),
    );

    const productById = new Map(drawableProducts.map((p) => [p.id, p]));
    const lines: DrawingImportSuggestedLineResult[] = suggestions.map(
      (suggestion) => {
        // AI SADECE verilen katalogdaki id'leri kullanabilir - uydurma (hallucinate)
        // bir id donerse burada null'a cevrilir, asla oldugu gibi guvenilmez.
        const product = suggestion.productId
          ? productById.get(suggestion.productId)
          : undefined;
        const productId = product ? suggestion.productId : null;
        return {
          rawLine: suggestion.rawLine,
          panelGroupLabel: suggestion.panelGroupLabel,
          productId,
          productName: product?.name ?? null,
          quantity: suggestion.quantity,
          confidence: suggestion.confidence,
          needsReview:
            !productId || suggestion.confidence < CONFIDENCE_REVIEW_THRESHOLD,
        };
      },
    );

    return { lines };
  }

  /**
   * Kullanici onay ekraninda satirlari gozden gecirip/duzelttikten sonra cagrilir -
   * her panelGroupLabel grubu kendi Drawing kaydini alir (1 Quote -> N Drawing, bkz.
   * docs/VARSAYIMLAR.md V52 karar #6).
   */
  async commit(dto: DrawingImportCommitDto): Promise<Drawing[]> {
    const created: Drawing[] = [];
    for (const group of dto.groups) {
      const drawing = await this.drawingsService.createFromProductSelection({
        quoteId: dto.quoteId,
        templateId: dto.templateId,
        name: group.name,
        panelGroupLabel: group.panelGroupLabel,
        items: group.items,
      });
      created.push(drawing);
    }
    return created;
  }
}
