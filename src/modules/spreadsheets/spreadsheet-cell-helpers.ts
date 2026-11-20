import type { SpreadsheetCellChangeDto } from './dto/spreadsheet.dto';
import type { ExistingCell } from './spreadsheet.types';

/** Kaydet sirasinda baska biri araya girip ayni hucreyi degistirdi - transaction'i geri
 * almak icin firlatilir, controller'a 409 olarak ulasir. */
export class ConflictSignal extends Error {
  constructor(public readonly cells: ExistingCell[]) {
    super('spreadsheet-conflict');
  }
}

export const key = (row: number, col: number): string => `${row}:${col}`;

export function emptyCell(row: number, col: number): ExistingCell {
  return {
    id: '',
    row,
    col,
    value: null,
    bgColor: null,
    fontColor: null,
    version: 0,
    updatedById: null,
  };
}

export function normalize(change: SpreadsheetCellChangeDto) {
  const value =
    change.value === null || change.value === '' ? null : change.value;
  return { value, bgColor: change.bgColor, fontColor: change.fontColor };
}

export function isNoop(
  existing: ExistingCell | undefined,
  next: ReturnType<typeof normalize>,
): boolean {
  const current = existing ?? { value: null, bgColor: null, fontColor: null };
  return (
    current.value === next.value &&
    current.bgColor === next.bgColor &&
    current.fontColor === next.fontColor
  );
}
