/** DB'deki Json degerini guvenli bir { "<col>": px } haritasina daraltir. */
export function parseColWidths(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, number> = {};
  for (const [col, width] of Object.entries(raw as Record<string, unknown>)) {
    if (/^\d+$/.test(col) && typeof width === 'number' && width > 0) {
      result[col] = width;
    }
  }
  return result;
}
