import type { Response } from 'express';
import type { ExportFormat } from '../export-format';

/**
 * Tum "Disa Aktar" controller uclarinin (firmalar, kisiler, gorusmeler...) paylastigi
 * kucuk yardimci - ilk kullanicisi imports.controller.ts'ti, interactions.controller.ts
 * ikinci kullanici oldugunda buraya cikarildi.
 */
export function parseExportFormat(value: string | undefined): ExportFormat {
  return value === 'pdf' ? 'pdf' : 'xlsx';
}

const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

export function sendExportFile(
  res: Response,
  buffer: Buffer,
  format: ExportFormat,
  baseFileName: string,
): void {
  res
    .header('Content-Type', EXPORT_CONTENT_TYPES[format])
    .header(
      'Content-Disposition',
      `attachment; filename="${baseFileName}.${format}"`,
    )
    .send(buffer);
}
