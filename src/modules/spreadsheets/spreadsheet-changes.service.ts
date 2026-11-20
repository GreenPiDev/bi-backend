import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  SaveSpreadsheetChangesDto,
  SpreadsheetCellChangeDto,
} from './dto/spreadsheet.dto';
import {
  ConflictSignal,
  emptyCell,
  isNoop,
  key,
  normalize,
} from './spreadsheet-cell-helpers';
import { cellAddress } from './spreadsheet-file-parser';
import {
  MAX_AUDIT_CHANGES,
  SPREADSHEET_AUDIT_ENTITY,
  SPREADSHEET_CELLS_UPDATED_EVENT,
} from './spreadsheets.constants';
import type {
  CompactCell,
  ExistingCell,
  SaveSpreadsheetChangesResult,
  SpreadsheetConflict,
} from './spreadsheet.types';
import { SpreadsheetsService } from './spreadsheets.service';

type Tx = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];

@Injectable()
export class SpreadsheetChangesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly spreadsheets: SpreadsheetsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async save(
    id: string,
    sheetId: string,
    dto: SaveSpreadsheetChangesDto,
  ): Promise<SaveSpreadsheetChangesResult> {
    const { spreadsheetName, sheetName } = await this.spreadsheets.assertSheet(
      id,
      sheetId,
    );
    const { tenantId, userId } = TenantContext.getOrThrow();
    const changes = this.dedupe(dto.changes);

    let result: { saved: CompactCell[]; audit: Record<string, unknown>[] };
    try {
      result = await this.prisma.$transaction(
        (tx) =>
          this.applyInTx(tx, sheetId, changes, Boolean(dto.force), userId),
        { timeout: 60_000 },
      );
    } catch (error) {
      if (error instanceof ConflictSignal)
        throw await this.conflictError(sheetId, error.cells);
      throw error;
    }

    if (result.saved.length > 0) {
      await this.prisma.spreadsheet.update({
        where: { id },
        data: { updatedById: userId },
      });
      await this.audit.log({
        action: 'SPREADSHEET_CELLS_UPDATED',
        entity: SPREADSHEET_AUDIT_ENTITY,
        entityId: id,
        meta: {
          spreadsheetName,
          sheetName,
          changeCount: result.audit.length,
          changes: result.audit.slice(0, MAX_AUDIT_CHANGES),
          truncated: result.audit.length > MAX_AUDIT_CHANGES,
          ...(dto.force ? { forced: true } : {}),
        },
      });
      const names = await this.spreadsheets.userNames([userId]);
      this.realtime.emitToTenant(tenantId, SPREADSHEET_CELLS_UPDATED_EVENT, {
        spreadsheetId: id,
        sheetId,
        cells: result.saved,
        updatedById: userId,
        updatedByName: names.get(userId) ?? '—',
      });
    }
    return { savedCount: result.saved.length, cells: result.saved };
  }

  /** Ayni hucre iki kez gelirse sonuncusu gecerli. */
  private dedupe(
    changes: SpreadsheetCellChangeDto[],
  ): SpreadsheetCellChangeDto[] {
    const map = new Map<string, SpreadsheetCellChangeDto>();
    for (const change of changes) map.set(key(change.row, change.col), change);
    return [...map.values()];
  }

  /**
   * Catisma kontrolu iki katmanli: (1) okunan surum baseVersion'a uymuyorsa, (2) okuma
   * ile yazma arasinda baska bir istek araya girerse kosullu updateMany 0 satir dondurur /
   * create unique ihlaline duser. Her iki durumda da tum transaction geri alinir.
   */
  private async applyInTx(
    tx: Tx,
    sheetId: string,
    changes: SpreadsheetCellChangeDto[],
    force: boolean,
    userId: string,
  ): Promise<{ saved: CompactCell[]; audit: Record<string, unknown>[] }> {
    const existingRows = (await tx.spreadsheetCell.findMany({
      where: { sheetId, row: { in: [...new Set(changes.map((c) => c.row))] } },
    })) as ExistingCell[];
    const existing = new Map(existingRows.map((c) => [key(c.row, c.col), c]));

    if (!force) {
      const conflicts = changes
        .map((c) => ({ c, e: existing.get(key(c.row, c.col)) }))
        .filter(({ c, e }) => (e?.version ?? 0) !== c.baseVersion)
        .map(({ c, e }) => e ?? emptyCell(c.row, c.col));
      if (conflicts.length > 0) throw new ConflictSignal(conflicts);
    }

    const saved: CompactCell[] = [];
    const audit: Record<string, unknown>[] = [];
    for (const change of changes) {
      const current = existing.get(key(change.row, change.col));
      const next = normalize(change);
      if (isNoop(current, next)) continue;
      const version = await this.writeCell(
        tx,
        sheetId,
        change,
        current,
        next,
        force,
        userId,
      );
      saved.push([
        change.row,
        change.col,
        next.value,
        next.bgColor,
        next.fontColor,
        version,
      ]);
      audit.push({
        cell: cellAddress(change.row, change.col),
        oldValue: current?.value ?? null,
        newValue: next.value,
        oldBgColor: current?.bgColor ?? null,
        newBgColor: next.bgColor,
        oldFontColor: current?.fontColor ?? null,
        newFontColor: next.fontColor,
      });
    }
    await this.growSheet(tx, sheetId, saved);
    return { saved, audit };
  }

  /** Izgaranin sonundaki bos hucrelere yazilan degerler sayfayi buyutur. */
  private async growSheet(
    tx: Tx,
    sheetId: string,
    saved: CompactCell[],
  ): Promise<void> {
    const filled = saved.filter(([, , value, bg, font]) => value || bg || font);
    if (filled.length === 0) return;
    const rowCount = Math.max(...filled.map(([row]) => row + 1));
    const colCount = Math.max(...filled.map(([, col]) => col + 1));
    await tx.spreadsheetSheet.updateMany({
      where: { id: sheetId, rowCount: { lt: rowCount } },
      data: { rowCount },
    });
    await tx.spreadsheetSheet.updateMany({
      where: { id: sheetId, colCount: { lt: colCount } },
      data: { colCount },
    });
  }

  private async writeCell(
    tx: Tx,
    sheetId: string,
    change: SpreadsheetCellChangeDto,
    current: ExistingCell | undefined,
    next: ReturnType<typeof normalize>,
    force: boolean,
    userId: string,
  ): Promise<number> {
    if (!current) {
      try {
        await tx.spreadsheetCell.create({
          data: {
            sheetId,
            row: change.row,
            col: change.col,
            ...next,
            updatedById: userId,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictSignal([emptyCell(change.row, change.col)]);
        }
        throw error;
      }
      return 1;
    }
    const updated = await tx.spreadsheetCell.updateMany({
      where: { id: current.id, ...(force ? {} : { version: current.version }) },
      data: { ...next, updatedById: userId, version: { increment: 1 } },
    });
    if (updated.count === 0) throw new ConflictSignal([current]);
    if (!force) return current.version + 1;
    const fresh = await tx.spreadsheetCell.findFirst({
      where: { id: current.id },
      select: { version: true },
    });
    return fresh?.version ?? current.version + 1;
  }

  /** Catisan hucrelerin GUNCEL halini (transaction disinda, taze okuyarak) doner ki
   * istemci "Onunkini al" secenegini dogru degerle uygulayabilsin. */
  private async conflictError(
    sheetId: string,
    cells: ExistingCell[],
  ): Promise<AppException> {
    const freshRows = (await this.prisma.spreadsheetCell.findMany({
      where: { sheetId, row: { in: [...new Set(cells.map((c) => c.row))] } },
    })) as ExistingCell[];
    const freshByKey = new Map(freshRows.map((c) => [key(c.row, c.col), c]));
    const resolved = cells.map((c) => freshByKey.get(key(c.row, c.col)) ?? c);
    const names = await this.spreadsheets.userNames(
      resolved.map((c) => c.updatedById),
    );
    const conflicts: SpreadsheetConflict[] = resolved.map((c) => ({
      row: c.row,
      col: c.col,
      cell: cellAddress(c.row, c.col),
      value: c.value,
      bgColor: c.bgColor,
      fontColor: c.fontColor,
      version: c.version,
      updatedByName: c.updatedById ? (names.get(c.updatedById) ?? '—') : '—',
    }));
    return new AppException(
      'SPREADSHEET_CONFLICT',
      'Siz duzenlerken baska biri bazi hucreleri degistirdi.',
      HttpStatus.CONFLICT,
      { conflicts },
    );
  }
}
