import { AppException } from '../../core/errors/app.exception';
import { assertPdfUpload } from './pdf-validation';

describe('assertPdfUpload', () => {
  it('%PDF magic byte + .pdf uzantili dosyayi kabul eder', () => {
    const buffer = Buffer.concat([
      Buffer.from('%PDF-1.4'),
      Buffer.from('rest'),
    ]);
    expect(() => assertPdfUpload('teklif.pdf', buffer)).not.toThrow();
  });

  it('.pdf uzantili ama magic byte uyusmayan dosyayi reddeder', () => {
    const buffer = Buffer.from('NOT A PDF');
    expect(() => assertPdfUpload('teklif.pdf', buffer)).toThrow(AppException);
  });

  it('magic byte dogru ama uzanti farkli dosyayi reddeder', () => {
    const buffer = Buffer.from('%PDF-1.4 rest');
    expect(() => assertPdfUpload('teklif.exe', buffer)).toThrow(AppException);
  });
});
