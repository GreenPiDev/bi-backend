export interface SpreadsheetSheetView {
  id: string;
  name: string;
  ordinal: number;
  rowCount: number;
  colCount: number;
  /** { "<col>": px } - tanimsiz sutun varsayilan genislikte. */
  colWidths: Record<string, number>;
}

export interface SpreadsheetSummaryView {
  id: string;
  name: string;
  originalFileName: string;
  sheetCount: number;
  createdByName: string;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpreadsheetDetailView extends SpreadsheetSummaryView {
  sheets: SpreadsheetSheetView[];
}

/** [row, col, value, bgColor, fontColor, version] - binlerce hucrede JSON boyutunu
 * kucuk tutmak icin nesne yerine kompakt dizi. */
export type CompactCell = [
  number,
  number,
  string | null,
  string | null,
  string | null,
  number,
];

export interface ExistingCell {
  id: string;
  row: number;
  col: number;
  value: string | null;
  bgColor: string | null;
  fontColor: string | null;
  version: number;
  updatedById: string | null;
}

export interface SpreadsheetConflict {
  row: number;
  col: number;
  cell: string;
  value: string | null;
  bgColor: string | null;
  fontColor: string | null;
  version: number;
  updatedByName: string;
}

export interface SaveSpreadsheetChangesResult {
  savedCount: number;
  cells: CompactCell[];
}

export interface UpdateColumnWidthsResult {
  colWidths: Record<string, number>;
}
