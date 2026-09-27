import { Injectable } from '@nestjs/common';
import type { DatasetFieldRole, DatasetFieldType } from '@prisma/client';
import { parseFlexibleDate } from '../../core/validators/date';

export interface InferredField {
  sourceName: string;
  name: string;
  label: string;
  type: DatasetFieldType;
  role: DatasetFieldRole;
}

const TR_CHAR_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
};

const TR_NUMBER_PATTERN = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;

const TRUE_VALUES = ['true', 'evet', 'dogru', 'doğru', '1'];
const FALSE_VALUES = ['false', 'hayir', 'hayır', 'yanlis', 'yanlış', '0'];
const BOOLEAN_TEXT_VALUES = [
  'true',
  'false',
  'evet',
  'hayir',
  'hayır',
  'dogru',
  'doğru',
  'yanlis',
  'yanlış',
];

function toLocaleLower(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

function isTrNumber(value: string): boolean {
  return TR_NUMBER_PATTERN.test(value.trim());
}

function parseTrNumber(value: string): number {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  return Number(normalized);
}

function isTrDate(value: string): boolean {
  return parseFlexibleDate(value) !== null;
}

/**
 * Boolean detection is restricted to explicit textual tokens (evet/hayır,
 * true/false, doğru/yanlış). Bare "1"/"0" columns are only treated as
 * boolean when every sampled value is exactly one of those two literal
 * tokens on top of a textual token elsewhere would already fail — a column
 * of plain "1"/"0" numbers stays NUMBER because it never matches a textual
 * token, avoiding misclassifying numeric measure columns as booleans.
 */
function isBooleanToken(value: string): boolean {
  return BOOLEAN_TEXT_VALUES.includes(toLocaleLower(value));
}

function toSafeColumnName(header: string, index: number): string {
  const lower = toLocaleLower(header);
  const transliterated = lower.replace(
    /[çğıöşü]/g,
    (ch) => TR_CHAR_MAP[ch] ?? ch,
  );
  const cleaned = transliterated
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
  const base = cleaned.slice(0, 41);
  if (!base || !/^[a-z_]/.test(base)) {
    return `kolon_${index + 1}`;
  }
  return base;
}

@Injectable()
export class TypeInferenceService {
  inferSchema(headers: string[], sampleRows: string[][]): InferredField[] {
    const usedNames = new Set<string>();
    return headers.map((header, index) => {
      const values = sampleRows
        .map((row) => row[index] ?? '')
        .filter((v) => v.trim() !== '');
      const type = this.inferColumnType(values);

      const base = toSafeColumnName(header, index);
      let name = base;
      let suffix = 2;
      while (usedNames.has(name)) {
        name = `${base.slice(0, 38)}_${suffix}`;
        suffix++;
      }
      usedNames.add(name);

      return {
        sourceName: header,
        name,
        label: header.trim() || `Kolon ${index + 1}`,
        type,
        role: this.defaultRole(type),
      };
    });
  }

  coerceValue(raw: string, type: DatasetFieldType): unknown {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return null;
    }
    switch (type) {
      case 'NUMBER': {
        if (!isTrNumber(trimmed)) {
          return null;
        }
        const n = parseTrNumber(trimmed);
        return Number.isNaN(n) ? null : n;
      }
      case 'DATE':
        return parseFlexibleDate(trimmed);
      case 'BOOLEAN':
        return this.toBoolean(trimmed);
      default:
        return trimmed;
    }
  }

  private toBoolean(value: string): boolean | null {
    const normalized = toLocaleLower(value);
    if (TRUE_VALUES.includes(normalized)) {
      return true;
    }
    if (FALSE_VALUES.includes(normalized)) {
      return false;
    }
    return null;
  }

  private defaultRole(type: DatasetFieldType): DatasetFieldRole {
    if (type === 'DATE') {
      return 'DATE';
    }
    if (type === 'NUMBER') {
      return 'MEASURE';
    }
    return 'DIMENSION';
  }

  private inferColumnType(values: string[]): DatasetFieldType {
    if (values.length === 0) {
      return 'STRING';
    }
    if (values.every((v) => isBooleanToken(v))) {
      return 'BOOLEAN';
    }
    if (values.every((v) => isTrNumber(v))) {
      return 'NUMBER';
    }
    if (values.every((v) => isTrDate(v))) {
      return 'DATE';
    }
    return 'STRING';
  }
}
