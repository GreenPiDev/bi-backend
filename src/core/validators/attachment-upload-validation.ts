import { HttpStatus } from '@nestjs/common';
import { AppException } from '../errors/app.exception';

export const MAX_MESSAGE_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_MESSAGE_ATTACHMENTS_PER_MESSAGE = 5;

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_RIFF = Buffer.from('RIFF', 'ascii');
const WEBP_TAG = Buffer.from('WEBP', 'ascii');
const PDF_MAGIC = Buffer.from('%PDF', 'ascii');
// .docx/.xlsx (OOXML) her ikisi de bir zip arsividir - magic byte seviyesinde
// birbirinden ayirt edilemez, sadece "gercekten bir zip mi" dogrulanir.
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
// legacy .doc/.xls (OLE Compound File Binary) - ikisi de ayni konteyner formati,
// ayni sebeple magic byte seviyesinde ayirt edilemez.
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

type MagicCheck = (buffer: Buffer) => boolean;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const MIME_TO_MAGIC_CHECK: Record<string, MagicCheck> = {
  'image/jpeg': (buf) => buf.subarray(0, 3).equals(JPEG_MAGIC),
  'image/png': (buf) => buf.subarray(0, 8).equals(PNG_MAGIC),
  'image/webp': (buf) =>
    buf.subarray(0, 4).equals(WEBP_RIFF) &&
    buf.subarray(8, 12).equals(WEBP_TAG),
  'application/pdf': (buf) => buf.subarray(0, 4).equals(PDF_MAGIC),
  'application/msword': (buf) => buf.subarray(0, 8).equals(OLE_MAGIC),
  'application/vnd.ms-excel': (buf) => buf.subarray(0, 8).equals(OLE_MAGIC),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (
    buf,
  ) => buf.subarray(0, 4).equals(ZIP_MAGIC),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (buf) =>
    buf.subarray(0, 4).equals(ZIP_MAGIC),
};

function unsupportedAttachmentTypeError(): AppException {
  return new AppException(
    'UNSUPPORTED_ATTACHMENT_TYPE',
    'Sadece PDF, Word, Excel veya JPEG/PNG/WEBP formatinda dosya eklenebilir.',
    HttpStatus.BAD_REQUEST,
  );
}

/**
 * Extension + declared MIME type + magic-byte cross-check (CLAUDE.md §10) - mesaj eki
 * (G3 genisletmesi) icin. Urun gorseli/avatarin `image-upload-validation.ts`'iyle ayni
 * desen, sadece ofis belgesi turleri eklendi.
 */
export function detectAttachmentExtension(
  mimeType: string,
  buffer: Buffer,
): string {
  const ext = MIME_TO_EXT[mimeType];
  const check = MIME_TO_MAGIC_CHECK[mimeType];
  if (!ext || !check || !check(buffer)) {
    throw unsupportedAttachmentTypeError();
  }
  return ext;
}
