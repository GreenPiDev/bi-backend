import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { AppException } from '../../../core/errors/app.exception';
import type { TemplateBand } from './auto-pack';

/**
 * `DrawingPanelTemplate.layout` serbest JSON olarak saklanir (Faz D3'te ham
 * textarea ile duzenleniyor, bkz. docs/VARSAYIMLAR.md V52) - bu yuzden motor
 * tarafindan okunurken savunmaci bicimde dogrulanir, bozuk/eksik bir sablon
 * sessizce yanlis geometri uretmez, acik bir hata dondurur.
 */
const TemplateBandSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  y: z.number(),
  heightMm: z.number().positive(),
});

const TemplateLayoutSchema = z.object({
  clearanceMm: z.number().nonnegative().optional().default(10),
  bands: z.array(TemplateBandSchema).min(1),
});

export interface ParsedTemplateLayout {
  clearanceMm: number;
  bands: TemplateBand[];
}

export function parseTemplateLayout(layout: unknown): ParsedTemplateLayout {
  const result = TemplateLayoutSchema.safeParse(layout);
  if (!result.success) {
    throw new AppException(
      'INVALID_TEMPLATE_LAYOUT',
      'Bu pano şablonunun yerleşim (layout) verisi geçersiz. Şablonu düzenleyip bant tanımlarını kontrol edin.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  return result.data;
}
