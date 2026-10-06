import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../core/errors/app.exception';

const PDF_MAGIC = Buffer.from('%PDF');

/**
 * Uzanti + magic-byte kontrolu (CLAUDE.md §10 ile ayni ilke, datasources'taki
 * `file-signature.ts`'ten ayri tutuldu cunku PDF sadece bu modulde yukleniyor).
 */
export function assertPdfUpload(originalName: string, buffer: Buffer): void {
  const looksLikePdf = buffer.subarray(0, 4).equals(PDF_MAGIC);
  if (!originalName.toLowerCase().endsWith('.pdf') || !looksLikePdf) {
    throw new AppException(
      'UNSUPPORTED_FILE_TYPE',
      'Sadece PDF dosyaları yüklenebilir.',
      HttpStatus.BAD_REQUEST,
    );
  }
}
