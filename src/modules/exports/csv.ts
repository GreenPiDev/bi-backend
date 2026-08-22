import Papa from 'papaparse';
import type { QueryColumn } from '../query/dto/query-spec.dto';

const FORMULA_PREFIXES = ['=', '+', '-', '@'];

/** CSV formul enjeksiyonuna karsi kacis (CLAUDE.md SS10): '=','+','-','@' ile baslayan
 * hucreler bir tablolama programinda (Excel vb.) formul olarak yorumlanmasin diye
 * baslarina tek tirnak eklenir. */
function escapeFormulaInjection(value: unknown): unknown {
  if (
    typeof value === 'string' &&
    FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix))
  ) {
    return `'${value}`;
  }
  return value;
}

export function buildCsv(columns: QueryColumn[], rows: unknown[][]): string {
  const fields = columns.map((c) => c.label);
  const data = rows.map((row) => row.map(escapeFormulaInjection));
  return Papa.unparse({ fields, data });
}
