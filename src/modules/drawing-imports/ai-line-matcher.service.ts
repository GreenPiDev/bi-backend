import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../core/errors/app.exception';
import {
  DrawingImportAiResponseSchema,
  type DrawingImportSuggestedLineDto,
} from './dto/drawing-import.dto';
import {
  DRAWING_IMPORTS_OPENAI_CLIENT,
  type OpenAiClient,
} from './openai-client.token';

const DEFAULT_MODEL = 'gpt-4o-mini';

export interface DrawingImportCandidateProduct {
  id: string;
  name: string;
  sku: string | null;
}

/**
 * AI KULLANIMI SINIRI (bkz. docs/VARSAYIMLAR.md V52, bi-backend-drawing-module-prompt.md):
 * - AI sadece metni yapilandirilmis veriye (hangi urun, hangi adet, hangi pano) cevirir.
 * - AI ASLA koordinat/geometri uretmez - `DrawingImportSuggestedLineSchema`'da bu alanlar
 *   hic yok, yani bu kisit sema seviyesinde zorlanir, prompt'a guvenmekle sinirli degildir.
 * - AI'nin ciktisi hicbir zaman otomatik/sessizce commit edilmez - her zaman kullanici
 *   onayina sunulur (bkz. `DrawingImportsService`'teki preview->onay->commit akisi).
 * - AI sadece VERILEN urun katalogundaki id'leri kullanabilir; katalogda olmayan bir id
 *   uretirse (hallucinate) `DrawingImportsService` bunu null'a cevirip "needsReview"
 *   isaretler - asla oldugu gibi guvenilmez.
 */
const SYSTEM_PROMPT = `Sen bir elektrik panosu teklif PDF'ini yapılandırılmış veriye çeviren bir asistansın.

Görevin: Verilen teklif PDF metnini satır satır analiz et, her bir ürün/komponent satırını
şu şemaya uygun bir JSON nesnesine çevir: { "lines": [ { "rawLine": string, "panelGroupLabel": string, "productId": string|null, "quantity": number, "confidence": number (0-1) } ] }

Kurallar:
- "panelGroupLabel": metinde "Pano 1", "Pano 2: Kompanzasyon" gibi başlıklar varsa o başlığı
  kullan; metin tek bir pano içinse "Pano 1" gibi tutarlı bir tek grup kullan.
- "productId": SADECE sana verilen ürün kataloğundaki id'lerden birini kullan. Satırın hangi
  ürüne karşılık geldiğinden kesin değilsen veya katalogda hiçbir ürün eşleşmiyorsa productId'yi
  null yap ve confidence'ı düşük (0.3 altı) ver. ASLA katalogda olmayan bir id uydurma.
- "quantity": satırda belirtilen adet; belirtilmemişse 1 kullan.
- ASLA x/y/konum/ölçü/rotasyon gibi geometrik bir alan üretme - böyle bir alan şemada yok,
  senden de istenmiyor.
- Sadece JSON nesnesini döndür, başka açıklama ekleme.`;

@Injectable()
export class AiLineMatcherService {
  constructor(
    @Inject(DRAWING_IMPORTS_OPENAI_CLIENT)
    private readonly openai: OpenAiClient,
    private readonly configService: ConfigService,
  ) {}

  async matchLines(
    pdfText: string,
    candidates: readonly DrawingImportCandidateProduct[],
  ): Promise<DrawingImportSuggestedLineDto[]> {
    const model =
      this.configService.get<string>('OPENAI_MODEL') ?? DEFAULT_MODEL;
    const candidateList = candidates
      .map((c) => `${c.id} | ${c.name}${c.sku ? ` | SKU:${c.sku}` : ''}`)
      .join('\n');

    const completion = await this.openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `ÜRÜN KATALOĞU (id | ad):\n${candidateList}\n\nTEKLİF PDF METNİ:\n${pdfText}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message.content ?? '{}';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppException(
        'AI_RESPONSE_INVALID',
        'Yapay zeka satır eşlemesi okunamadı, lütfen tekrar deneyin.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const result = DrawingImportAiResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new AppException(
        'AI_RESPONSE_INVALID',
        'Yapay zeka satır eşlemesi geçersiz formatta döndü, lütfen tekrar deneyin.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return result.data.lines;
  }
}
