import { HttpStatus } from '@nestjs/common';
import { AppException } from '../errors/app.exception';

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_RIFF = Buffer.from('RIFF', 'ascii');
const WEBP_TAG = Buffer.from('WEBP', 'ascii');

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function unsupportedImageTypeError(): AppException {
  return new AppException(
    'UNSUPPORTED_IMAGE_TYPE',
    'Sadece JPEG, PNG veya WEBP formatinda resim yuklenebilir.',
    HttpStatus.BAD_REQUEST,
  );
}

/**
 * Extension + declared MIME type + magic-byte cross-check (CLAUDE.md §10). Urun gorseli
 * (Faz 11i) ve kullanici avatari (Faz 11j) tarafindan ortak kullanilir.
 */
export function detectImageExtension(mimeType: string, buffer: Buffer): string {
  const ext = MIME_TO_EXT[mimeType];
  if (!ext) {
    throw unsupportedImageTypeError();
  }

  const looksLikeJpeg = buffer.subarray(0, 3).equals(JPEG_MAGIC);
  const looksLikePng = buffer.subarray(0, 8).equals(PNG_MAGIC);
  const looksLikeWebp =
    buffer.subarray(0, 4).equals(WEBP_RIFF) &&
    buffer.subarray(8, 12).equals(WEBP_TAG);

  if (
    (mimeType === 'image/jpeg' && !looksLikeJpeg) ||
    (mimeType === 'image/png' && !looksLikePng) ||
    (mimeType === 'image/webp' && !looksLikeWebp)
  ) {
    throw unsupportedImageTypeError();
  }

  return ext;
}
