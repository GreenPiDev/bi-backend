import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { SpreadsheetChangesService } from './spreadsheet-changes.service';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const SPREADSHEET_ID = '11111111-1111-4111-8111-111111111111';
const SHEET_ID = '22222222-2222-4222-8222-222222222222';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run(
    { tenantId: TENANT_ID, userId: USER_ID, roleIds: [] },
    fn,
  );
}

function existingCell(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cell-1',
    row: 1,
    col: 1,
    value: '10',
    bgColor: null,
    fontColor: null,
    version: 3,
    updatedById: 'user-2',
    ...overrides,
  };
}

function setup(existing: ReturnType<typeof existingCell>[] = []) {
  const client = {
    spreadsheetCell: {
      findMany: vi.fn().mockResolvedValue(existing),
      findFirst: vi.fn().mockResolvedValue({ version: 9 }),
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    spreadsheet: { update: vi.fn().mockResolvedValue({}) },
    spreadsheetSheet: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    ...client,
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(client)),
  };
  const spreadsheets = {
    assertSheet: vi
      .fn()
      .mockResolvedValue({ spreadsheetName: 'Stok', sheetName: 'Sayfa1' }),
    userNames: vi.fn().mockResolvedValue(
      new Map([
        [USER_ID, 'Ali'],
        ['user-2', 'Ayşe'],
      ]),
    ),
  };
  const audit = { log: vi.fn() };
  const realtime = { emitToTenant: vi.fn() };
  const service = new SpreadsheetChangesService(
    prisma as never,
    spreadsheets as never,
    audit as never,
    realtime as never,
  );
  return { service, client, spreadsheets, audit, realtime };
}

describe('SpreadsheetChangesService.save', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates an existing cell with a version-guarded write, audits and broadcasts', async () => {
    const { service, client, audit, realtime } = setup([existingCell()]);

    const result = await runInTenant(() =>
      service.save(SPREADSHEET_ID, SHEET_ID, {
        changes: [
          {
            row: 1,
            col: 1,
            value: '12',
            bgColor: '#FFFF00',
            fontColor: null,
            baseVersion: 3,
          },
        ],
      }),
    );

    expect(client.spreadsheetCell.updateMany).toHaveBeenCalledWith({
      where: { id: 'cell-1', version: 3 },
      data: expect.objectContaining({
        value: '12',
        bgColor: '#FFFF00',
        version: { increment: 1 },
      }),
    });
    expect(result.cells).toEqual([[1, 1, '12', '#FFFF00', null, 4]]);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SPREADSHEET_CELLS_UPDATED',
        entity: 'spreadsheet',
        entityId: SPREADSHEET_ID,
        meta: expect.objectContaining({
          spreadsheetName: 'Stok',
          sheetName: 'Sayfa1',
          changeCount: 1,
          changes: [
            {
              cell: 'B2',
              oldValue: '10',
              newValue: '12',
              oldBgColor: null,
              newBgColor: '#FFFF00',
              oldFontColor: null,
              newFontColor: null,
            },
          ],
        }),
      }),
    );
    expect(realtime.emitToTenant).toHaveBeenCalledWith(
      TENANT_ID,
      'spreadsheets.cells.updated',
      expect.objectContaining({ sheetId: SHEET_ID, updatedByName: 'Ali' }),
    );
  });

  it('creates a missing cell when baseVersion is 0', async () => {
    const { service, client } = setup([]);

    const result = await runInTenant(() =>
      service.save(SPREADSHEET_ID, SHEET_ID, {
        changes: [
          {
            row: 4,
            col: 0,
            value: 'Yeni',
            bgColor: null,
            fontColor: '#FF0000',
            baseVersion: 0,
          },
        ],
      }),
    );

    expect(client.spreadsheetCell.create).toHaveBeenCalled();
    expect(result.cells).toEqual([[4, 0, 'Yeni', null, '#FF0000', 1]]);
  });

  it('returns 409 SPREADSHEET_CONFLICT when someone else changed the cell', async () => {
    const { service, client, audit } = setup([
      existingCell({ value: '15', version: 4 }),
    ]);

    const error = await runInTenant(() =>
      service.save(SPREADSHEET_ID, SHEET_ID, {
        changes: [
          {
            row: 1,
            col: 1,
            value: '12',
            bgColor: null,
            fontColor: null,
            baseVersion: 3,
          },
        ],
      }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    const appError = error as AppException;
    expect(appError.code).toBe('SPREADSHEET_CONFLICT');
    expect(appError.getStatus()).toBe(409);
    expect(appError.details?.conflicts).toEqual([
      expect.objectContaining({
        cell: 'B2',
        value: '15',
        version: 4,
        updatedByName: 'Ayşe',
      }),
    ]);
    expect(client.spreadsheetCell.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('treats a lost race in the guarded update as a conflict', async () => {
    const { service, client } = setup([existingCell()]);
    client.spreadsheetCell.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      runInTenant(() =>
        service.save(SPREADSHEET_ID, SHEET_ID, {
          changes: [
            {
              row: 1,
              col: 1,
              value: '12',
              bgColor: null,
              fontColor: null,
              baseVersion: 3,
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'SPREADSHEET_CONFLICT' });
  });

  it('overwrites without version check when force is true', async () => {
    const { service, client, audit } = setup([existingCell({ version: 7 })]);

    const result = await runInTenant(() =>
      service.save(SPREADSHEET_ID, SHEET_ID, {
        force: true,
        changes: [
          {
            row: 1,
            col: 1,
            value: '12',
            bgColor: null,
            fontColor: null,
            baseVersion: 3,
          },
        ],
      }),
    );

    expect(client.spreadsheetCell.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cell-1' } }),
    );
    expect(result.cells[0][5]).toBe(9);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ forced: true }),
      }),
    );
  });

  it('skips no-op changes and does not audit when nothing changed', async () => {
    const { service, client, audit, realtime } = setup([existingCell()]);

    const result = await runInTenant(() =>
      service.save(SPREADSHEET_ID, SHEET_ID, {
        changes: [
          {
            row: 1,
            col: 1,
            value: '10',
            bgColor: null,
            fontColor: null,
            baseVersion: 3,
          },
        ],
      }),
    );

    expect(result.savedCount).toBe(0);
    expect(client.spreadsheetCell.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(realtime.emitToTenant).not.toHaveBeenCalled();
  });

  it('propagates 404 from the tenant-scoped sheet check (other tenant ids)', async () => {
    const { service, spreadsheets } = setup();
    spreadsheets.assertSheet.mockRejectedValue(
      new AppException('NOT_FOUND', 'Tablo bulunamadi.', 404),
    );

    await expect(
      runInTenant(() =>
        service.save(SPREADSHEET_ID, SHEET_ID, {
          changes: [
            {
              row: 0,
              col: 0,
              value: 'x',
              bgColor: null,
              fontColor: null,
              baseVersion: 0,
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
