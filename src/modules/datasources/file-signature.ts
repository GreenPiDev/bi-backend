import { HttpStatus } from '@nestjs/common';
import type { DataSourceType } from '@prisma/client';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { AppException } from '../../core/errors/app.exception';

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const CSV_MIME_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream',
]);

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/octet-stream',
]);

function unsupportedFileTypeError(): AppException {
  return new AppException(
    'UNSUPPORTED_FILE_TYPE',
    'Sadece CSV veya XLSX dosyalari yuklenebilir.',
    HttpStatus.BAD_REQUEST,
  );
}

/**
 * Extension + declared MIME type + magic-byte cross-check (CLAUDE.md §10).
 * Extension/magic bytes are the authoritative signal; MIME type is only
 * used to reject obviously-wrong uploads since browsers report it loosely.
 */
export async function detectDataSourceType(
  originalName: string,
  mimeType: string,
  filePath: string,
): Promise<DataSourceType> {
  const ext = path.extname(originalName).toLowerCase();
  const header = Buffer.alloc(4);
  const fileHandle = await fsPromises.open(filePath, 'r');
  try {
    await fileHandle.read(header, 0, 4, 0);
  } finally {
    await fileHandle.close();
  }
  const looksLikeXlsx = header.equals(XLSX_MAGIC);

  if (ext === '.xlsx') {
    if (!looksLikeXlsx || !XLSX_MIME_TYPES.has(mimeType)) {
      throw unsupportedFileTypeError();
    }
    return 'XLSX';
  }

  if (ext === '.csv') {
    if (looksLikeXlsx || !CSV_MIME_TYPES.has(mimeType)) {
      throw unsupportedFileTypeError();
    }
    return 'CSV';
  }

  throw unsupportedFileTypeError();
}
