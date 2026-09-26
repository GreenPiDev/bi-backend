import { describe, expect, it } from 'vitest';
import { AppException } from '../errors/app.exception';
import { detectAttachmentExtension } from './attachment-upload-validation';

const PDF_BUFFER = Buffer.from('%PDF-1.4\nfake');
const ZIP_BUFFER = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const OLE_BUFFER = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0,
]);
const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0]);
const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const WEBP_BUFFER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP', 'ascii'),
]);

describe('detectAttachmentExtension', () => {
  it.each([
    ['application/pdf', PDF_BUFFER, 'pdf'],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ZIP_BUFFER,
      'docx',
    ],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ZIP_BUFFER,
      'xlsx',
    ],
    ['application/msword', OLE_BUFFER, 'doc'],
    ['application/vnd.ms-excel', OLE_BUFFER, 'xls'],
    ['image/jpeg', JPEG_BUFFER, 'jpg'],
    ['image/png', PNG_BUFFER, 'png'],
    ['image/webp', WEBP_BUFFER, 'webp'],
  ])('%s icin dogru uzantiyi doner', (mimeType, buffer, expectedExt) => {
    expect(detectAttachmentExtension(mimeType, buffer as Buffer)).toBe(
      expectedExt,
    );
  });

  it('bilinmeyen mime type icin UNSUPPORTED_ATTACHMENT_TYPE firlatir', () => {
    expect(() =>
      detectAttachmentExtension('application/zip', ZIP_BUFFER),
    ).toThrow(AppException);
  });

  it('mime type dogru ama magic byte uyusmuyorsa (spoofing) reddeder', () => {
    expect(() =>
      detectAttachmentExtension('application/pdf', JPEG_BUFFER),
    ).toThrow(AppException);
    expect(() => detectAttachmentExtension('image/png', PDF_BUFFER)).toThrow(
      AppException,
    );
    expect(() =>
      detectAttachmentExtension('application/msword', ZIP_BUFFER),
    ).toThrow(AppException);
  });
});
