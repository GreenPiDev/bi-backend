import { beforeEach, describe, expect, it } from 'vitest';
import { TypeInferenceService } from './type-inference.service';

describe('TypeInferenceService', () => {
  let service: TypeInferenceService;

  beforeEach(() => {
    service = new TypeInferenceService();
  });

  describe('inferSchema', () => {
    it('infers NUMBER for TR-formatted numeric columns (1.234,56)', () => {
      const [field] = service.inferSchema(
        ['Tutar'],
        [['1.234,56'], ['999'], ['-12,5']],
      );
      expect(field.type).toBe('NUMBER');
      expect(field.role).toBe('MEASURE');
    });

    it('infers DATE for dd.MM.yyyy formatted columns', () => {
      const [field] = service.inferSchema(
        ['Tarih'],
        [['01.03.2026'], ['15.12.2025'], ['31.01.2024 14:30']],
      );
      expect(field.type).toBe('DATE');
      expect(field.role).toBe('DATE');
    });

    it('infers DATE for ISO formatted columns (from XLSX)', () => {
      const [field] = service.inferSchema(
        ['Tarih'],
        [['2026-03-01T00:00:00.000Z'], ['2025-12-15T00:00:00.000Z']],
      );
      expect(field.type).toBe('DATE');
    });

    it('infers BOOLEAN for evet/hayir columns', () => {
      const [field] = service.inferSchema(
        ['Aktif'],
        [['Evet'], ['Hayır'], ['evet']],
      );
      expect(field.type).toBe('BOOLEAN');
    });

    it('does not classify a plain 1/0 numeric column as boolean', () => {
      const [field] = service.inferSchema(['Adet'], [['1'], ['0'], ['5']]);
      expect(field.type).toBe('NUMBER');
    });

    it('falls back to STRING for mixed-type columns', () => {
      const [field] = service.inferSchema(
        ['Karisik'],
        [['123'], ['abc'], ['01.01.2026']],
      );
      expect(field.type).toBe('STRING');
      expect(field.role).toBe('DIMENSION');
    });

    it('ignores empty cells when inferring type', () => {
      const [field] = service.inferSchema(
        ['Tutar'],
        [['1.234,56'], [''], ['  '], ['999']],
      );
      expect(field.type).toBe('NUMBER');
    });

    it('defaults an entirely empty column to STRING', () => {
      const [field] = service.inferSchema(['Bos'], [[''], ['']]);
      expect(field.type).toBe('STRING');
    });

    it('normalizes Turkish headers into safe snake_case column names (İ/ı trap)', () => {
      const fields = service.inferSchema(
        ['Müşteri İsmi', 'İl', 'Sipariş Tutarı (₺)'],
        [['a', 'b', '1,5']],
      );
      expect(fields[0].name).toBe('musteri_ismi');
      expect(fields[1].name).toBe('il');
      expect(fields[2].name).toMatch(/^siparis_tutari/);
      for (const field of fields) {
        expect(field.name).toMatch(/^[a-z_][a-z0-9_]{0,40}$/);
      }
    });

    it('deduplicates column names that normalize to the same value', () => {
      const fields = service.inferSchema(['Tutar', 'Tutar!'], [['1', '2']]);
      expect(fields[0].name).toBe('tutar');
      expect(fields[1].name).toBe('tutar_2');
    });

    it('falls back to a positional name when the header has no safe characters', () => {
      const fields = service.inferSchema(['€€€'], [['1']]);
      expect(fields[0].name).toBe('kolon_1');
    });
  });

  describe('coerceValue', () => {
    it('parses TR-formatted numbers', () => {
      expect(service.coerceValue('1.234,56', 'NUMBER')).toBeCloseTo(1234.56);
      expect(service.coerceValue('-12,5', 'NUMBER')).toBeCloseTo(-12.5);
    });

    it('parses dd.MM.yyyy dates into a Date instance', () => {
      const date = service.coerceValue('01.03.2026', 'DATE') as Date;
      expect(date).toBeInstanceOf(Date);
      expect(date.getUTCFullYear()).toBe(2026);
      expect(date.getUTCMonth()).toBe(2);
      expect(date.getUTCDate()).toBe(1);
    });

    it('parses evet/hayir into booleans', () => {
      expect(service.coerceValue('Evet', 'BOOLEAN')).toBe(true);
      expect(service.coerceValue('Hayır', 'BOOLEAN')).toBe(false);
    });

    it('returns null for empty values regardless of type', () => {
      expect(service.coerceValue('', 'NUMBER')).toBeNull();
      expect(service.coerceValue('   ', 'DATE')).toBeNull();
    });

    it('returns null for a value that does not match the target type', () => {
      expect(service.coerceValue('abc', 'NUMBER')).toBeNull();
      expect(service.coerceValue('not-a-date', 'DATE')).toBeNull();
    });

    it('returns the trimmed string as-is for STRING type', () => {
      expect(service.coerceValue('  merhaba  ', 'STRING')).toBe('merhaba');
    });
  });
});
