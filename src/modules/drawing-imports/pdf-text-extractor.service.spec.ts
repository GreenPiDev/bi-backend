import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppException } from '../../core/errors/app.exception';
import { PdfTextExtractorService } from './pdf-text-extractor.service';

const FIXTURES_DIR = path.join(
  __dirname,
  '../../../test/fixtures/drawing-imports',
);

describe('PdfTextExtractorService', () => {
  it('gercek metin katmani olan bir PDF dosyasindan metni cikarir', async () => {
    const buffer = fs.readFileSync(path.join(FIXTURES_DIR, 'quote-sample.pdf'));
    const service = new PdfTextExtractorService();
    const text = await service.extractText(buffer);
    expect(text).toContain('Pano 1: Ana Dagitim Panosu');
    expect(text).toContain('ABB Sace Tmax XT1 160 3P 630A kesici');
    expect(text).toContain('Pano 2: Kompanzasyon Panosu');
  });

  it('metin katmani olmayan (taranmis) bir PDF icin SCANNED_PDF_NOT_SUPPORTED firlatir', async () => {
    const buffer = fs.readFileSync(
      path.join(FIXTURES_DIR, 'scanned-sample.pdf'),
    );
    const service = new PdfTextExtractorService();
    await expect(service.extractText(buffer)).rejects.toMatchObject({
      code: 'SCANNED_PDF_NOT_SUPPORTED',
    } satisfies Partial<AppException>);
  });

  it('bozuk/gecersiz PDF icin PDF_PARSE_FAILED firlatir', async () => {
    const buffer = Buffer.from('bu bir PDF degil');
    const service = new PdfTextExtractorService();
    await expect(service.extractText(buffer)).rejects.toMatchObject({
      code: 'PDF_PARSE_FAILED',
    } satisfies Partial<AppException>);
  });
});
