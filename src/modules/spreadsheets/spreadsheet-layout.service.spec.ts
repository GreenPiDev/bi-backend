import { describe, expect, it, vi } from 'vitest';
import { TenantContext } from '../../core/tenant/tenant-context';
import { parseColWidths } from './spreadsheet-col-widths';
import { SpreadsheetLayoutService } from './spreadsheet-layout.service';
import { SPREADSHEET_COLUMNS_UPDATED_EVENT } from './spreadsheets.constants';
import type { SpreadsheetsService } from './spreadsheets.service';

const SPREADSHEET_ID = '11111111-1111-4111-8111-111111111111';
const SHEET_ID = '22222222-2222-4222-8222-222222222222';

function setup(existing: unknown) {
  const tx = {
    spreadsheetSheet: {
      findFirst: vi.fn().mockResolvedValue({ colWidths: existing }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const spreadsheets = {
    assertSheet: vi
      .fn()
      .mockResolvedValue({ spreadsheetName: 'Stok', sheetName: 'Sayfa1' }),
  };
  const realtime = { emitToTenant: vi.fn() };
  const service = new SpreadsheetLayoutService(
    prisma as never,
    spreadsheets as unknown as SpreadsheetsService,
    realtime as never,
  );
  return { service, tx, spreadsheets, realtime };
}

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run(
    { tenantId: 'tenant-1', userId: 'user-1', roleIds: [] },
    fn,
  );
}

describe('SpreadsheetLayoutService.updateColumnWidths', () => {
  it('merges widths into existing ones, resets null and broadcasts', async () => {
    const { service, tx, realtime } = setup({ '0': 200, '3': 90 });

    const result = await runInTenant(() =>
      service.updateColumnWidths(SPREADSHEET_ID, SHEET_ID, {
        widths: [
          { col: 2, width: 260 },
          { col: 3, width: null },
        ],
      }),
    );

    expect(result.colWidths).toEqual({ '0': 200, '2': 260 });
    expect(tx.spreadsheetSheet.update).toHaveBeenCalledWith({
      where: { id: SHEET_ID },
      data: { colWidths: { '0': 200, '2': 260 } },
    });
    expect(realtime.emitToTenant).toHaveBeenCalledWith(
      'tenant-1',
      SPREADSHEET_COLUMNS_UPDATED_EVENT,
      {
        spreadsheetId: SPREADSHEET_ID,
        sheetId: SHEET_ID,
        colWidths: { '0': 200, '2': 260 },
        updatedById: 'user-1',
      },
    );
  });

  it('propagates 404 from assertSheet (other tenant / wrong sheet)', async () => {
    const { service, spreadsheets, tx } = setup(null);
    spreadsheets.assertSheet.mockRejectedValue(new Error('NOT_FOUND'));

    await expect(
      runInTenant(() =>
        service.updateColumnWidths(SPREADSHEET_ID, SHEET_ID, {
          widths: [{ col: 0, width: 100 }],
        }),
      ),
    ).rejects.toThrow('NOT_FOUND');
    expect(tx.spreadsheetSheet.update).not.toHaveBeenCalled();
  });
});

describe('parseColWidths', () => {
  it('keeps only numeric column keys with positive numbers', () => {
    expect(
      parseColWidths({ '1': 150, x: 10, '2': 'wide', '3': -5, '4': 80 }),
    ).toEqual({ '1': 150, '4': 80 });
    expect(parseColWidths(null)).toEqual({});
    expect(parseColWidths([1, 2])).toEqual({});
  });
});
