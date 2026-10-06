import { HttpStatus, Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { AppException } from '../../core/errors/app.exception';

/** pdf-parse'in sayfa sinirlarina ekledigi "-- N of M --" isaretcisi, anlamli
 * metin uzunlugu hesaplanirken cikarilir (bkz. docs/VARSAYIMLAR.md V52). */
const PAGE_MARKER_PATTERN = /--\s*\d+\s*of\s*\d+\s*--/g;
const MIN_MEANINGFUL_TEXT_LENGTH = 20;

@Injectable()
export class PdfTextExtractorService {
  /**
   * Gercek metin katmani olmayan (taranmis) PDF'ler kapsam disi (bkz.
   * docs/VARSAYIMLAR.md V52) - boyle bir dosya yuklenirse acik bir hata doner,
   * sessizce bos/yanlis sonuc uretmez.
   */
  async extractText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const cleaned = result.text.replace(PAGE_MARKER_PATTERN, '').trim();
      if (cleaned.length < MIN_MEANINGFUL_TEXT_LENGTH) {
        throw new AppException(
          'SCANNED_PDF_NOT_SUPPORTED',
          'Bu PDF taranmış bir belge gibi görünüyor (gerçek metin katmanı bulunamadı). Sadece gerçek metin içeren PDF dosyaları desteklenir.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      return cleaned;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(
        'PDF_PARSE_FAILED',
        'PDF dosyası okunamadı. Dosyanın bozuk olmadığından emin olun.',
        HttpStatus.BAD_REQUEST,
      );
    } finally {
      await parser.destroy();
    }
  }
}
