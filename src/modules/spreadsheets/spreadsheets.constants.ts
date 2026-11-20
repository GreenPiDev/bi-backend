export const MAX_SPREADSHEET_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS_PER_SHEET = 50_000;
export const MAX_COLS_PER_SHEET = 200;
export const MAX_TOTAL_CELLS = 500_000;
/** Tek bir "Kaydet" isteginde gonderilebilecek en fazla hucre degisikligi. */
export const MAX_CHANGES_PER_SAVE = 5_000;
/** Denetim kaydi meta'sina yazilan en fazla degisiklik satiri - asilirsa truncated=true. */
export const MAX_AUDIT_CHANGES = 500;
export const CELL_INSERT_CHUNK_SIZE = 5_000;
export const SPREADSHEET_AUDIT_ENTITY = 'spreadsheet';
export const SPREADSHEET_CELLS_UPDATED_EVENT = 'spreadsheets.cells.updated';
export const SPREADSHEET_COLUMNS_UPDATED_EVENT = 'spreadsheets.columns.updated';
export const MIN_COL_WIDTH = 30;
export const MAX_COL_WIDTH = 1_000;
export const SPREADSHEET_REPLACED_EVENT = 'spreadsheets.replaced';
