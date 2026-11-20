import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantContext } from '../../core/tenant/tenant-context';
import { SpreadsheetsService } from './spreadsheets.service';

const SPREADSHEET_ID = '11111111-1111-4111-8111-111111111111';
const SHEET_ID = '22222222-2222-4222-8222-222222222222';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run(
    { tenantId: 'tenant-1', userId: 'user-1', roleIds: [] },
    fn,
  );
}

function setup() {
  const prisma = {
    spreadsheet: {
      findFirst: vi.fn().mockResolvedValue({
        id: SPREADSHEET_ID,
        name: 'Stok',
        originalFileName: 'stok.xlsx',
        createdById: 'user-1',
        updatedById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        sheets: [],
      }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    spreadsheetSheet: {
      findFirst: vi.fn().mockResolvedValue({ name: 'Sayfa1' }),
    },
    spreadsheetCell: {
      findMany: vi.fn().mockResolvedValue([
        {
          row: 0,
          col: 1,
          value: 'Miktar',
          bgColor: '#FFFF00',
          fontColor: null,
          version: 2,
        },
      ]),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: 'user-1', name: 'Ali' }]),
    },
  };
  const audit = { log: vi.fn() };
  const service = new SpreadsheetsService(
    prisma as never,
    audit as never,
    { emitToTenant: () => undefined } as never,
  );
  return { service, prisma, audit };
}

describe('SpreadsheetsService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns cells as compact tuples', async () => {
    const { service } = setup();
    const cells = await runInTenant(() =>
      service.getCells(SPREADSHEET_ID, SHEET_ID),
    );
    expect(cells).toEqual([[0, 1, 'Miktar', '#FFFF00', null, 2]]);
  });

  it('404s when the spreadsheet is not visible to this tenant', async () => {
    const { service, prisma } = setup();
    prisma.spreadsheet.findFirst.mockResolvedValue(null);
    await expect(
      runInTenant(() => service.getCells(SPREADSHEET_ID, SHEET_ID)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.spreadsheetCell.findMany).not.toHaveBeenCalled();
  });

  it('404s when the sheet belongs to another spreadsheet', async () => {
    const { service, prisma } = setup();
    prisma.spreadsheetSheet.findFirst.mockResolvedValue(null);
    await expect(
      runInTenant(() => service.getCells(SPREADSHEET_ID, SHEET_ID)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.spreadsheetSheet.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SHEET_ID, spreadsheetId: SPREADSHEET_ID },
      }),
    );
  });

  it('renames and audits the previous name', async () => {
    const { service, audit } = setup();
    await runInTenant(() =>
      service.rename(SPREADSHEET_ID, { name: 'Stok 2026' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SPREADSHEET_RENAMED',
        meta: { spreadsheetName: 'Stok 2026', previousName: 'Stok' },
      }),
    );
  });

  it('soft-deletes and audits', async () => {
    const { service, prisma, audit } = setup();
    await runInTenant(() => service.remove(SPREADSHEET_ID));
    expect(prisma.spreadsheet.delete).toHaveBeenCalledWith({
      where: { id: SPREADSHEET_ID },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SPREADSHEET_DELETED' }),
    );
  });
});
