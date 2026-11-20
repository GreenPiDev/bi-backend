import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DataSourceType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as path from 'node:path';
import { findIdsByTurkishSearch } from '../../core/db/turkish-search';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  SpreadsheetQueryDto,
  UpdateSpreadsheetDto,
} from './dto/spreadsheet.dto';
import { parseColWidths } from './spreadsheet-col-widths';
import { parseSpreadsheetFile } from './spreadsheet-file-parser';
import type {
  CompactCell,
  SpreadsheetDetailView,
  SpreadsheetSummaryView,
} from './spreadsheet.types';
import {
  CELL_INSERT_CHUNK_SIZE,
  SPREADSHEET_AUDIT_ENTITY,
  SPREADSHEET_REPLACED_EVENT,
} from './spreadsheets.constants';

const SORTABLE_FIELDS = new Set(['name', 'createdAt', 'updatedAt']);

function notFound(): AppException {
  return new AppException(
    'NOT_FOUND',
    'Tablo bulunamadi.',
    HttpStatus.NOT_FOUND,
  );
}

function defaultNameFromFile(originalName: string): string {
  const base = path.basename(originalName, path.extname(originalName)).trim();
  return (base || 'Yeni Tablo').slice(0, 200);
}

@Injectable()
export class SpreadsheetsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(
    query: SpreadsheetQueryDto,
  ): Promise<PagedResult<SpreadsheetSummaryView>> {
    const { page, pageSize, q } = query;
    const [sortField, sortDir] = (query.sort ?? 'updatedAt:desc').split(':');
    const field = SORTABLE_FIELDS.has(sortField) ? sortField : 'updatedAt';
    const direction = sortDir === 'asc' ? 'asc' : 'desc';
    const matchingIds = q
      ? await findIdsByTurkishSearch(
          this.prisma,
          'spreadsheets',
          ['name', 'originalFileName'],
          q,
          {
            softDelete: true,
          },
        )
      : null;
    const where = matchingIds ? { id: { in: matchingIds } } : {};

    const [rows, total] = await Promise.all([
      this.prisma.spreadsheet.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        include: { _count: { select: { sheets: true } } },
      }),
      this.prisma.spreadsheet.count({ where }),
    ]);

    const names = await this.userNames(
      rows.flatMap((r) => [r.createdById, r.updatedById]),
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        originalFileName: r.originalFileName,
        sheetCount: r._count.sheets,
        createdByName: names.get(r.createdById) ?? '—',
        updatedByName: r.updatedById ? (names.get(r.updatedById) ?? '—') : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async getById(id: string): Promise<SpreadsheetDetailView> {
    const spreadsheet = await this.prisma.spreadsheet.findFirst({
      where: { id },
      include: { sheets: { orderBy: { ordinal: 'asc' } } },
    });
    if (!spreadsheet) throw notFound();
    const names = await this.userNames([
      spreadsheet.createdById,
      spreadsheet.updatedById,
    ]);
    return {
      id: spreadsheet.id,
      name: spreadsheet.name,
      originalFileName: spreadsheet.originalFileName,
      sheetCount: spreadsheet.sheets.length,
      createdByName: names.get(spreadsheet.createdById) ?? '—',
      updatedByName: spreadsheet.updatedById
        ? (names.get(spreadsheet.updatedById) ?? '—')
        : null,
      createdAt: spreadsheet.createdAt,
      updatedAt: spreadsheet.updatedAt,
      sheets: spreadsheet.sheets.map((s) => ({
        id: s.id,
        name: s.name,
        ordinal: s.ordinal,
        rowCount: s.rowCount,
        colCount: s.colCount,
        colWidths: parseColWidths(s.colWidths),
      })),
    };
  }

  /** Sayfanin tum kayitli hucreleri (bos ama surumu olan hucreler dahil - istemci
   * catisma tespiti icin her hucrenin guncel surumunu bilmeli). */
  async getCells(id: string, sheetId: string): Promise<CompactCell[]> {
    await this.assertSheet(id, sheetId);
    const cells = await this.prisma.spreadsheetCell.findMany({
      where: { sheetId },
      select: {
        row: true,
        col: true,
        value: true,
        bgColor: true,
        fontColor: true,
        version: true,
      },
    });
    return cells.map((c) => [
      c.row,
      c.col,
      c.value,
      c.bgColor,
      c.fontColor,
      c.version,
    ]);
  }

  /** Tablonun guncel (kayitli) halini renkler ve sutun genislikleriyle XLSX'e cevirir. */
  async exportXlsx(id: string): Promise<{ buffer: Buffer; fileName: string }> {
    const spreadsheet = await this.prisma.spreadsheet.findFirst({
      where: { id },
      include: { sheets: { orderBy: { ordinal: 'asc' } } },
    });
    if (!spreadsheet) throw notFound();

    const workbook = new ExcelJS.Workbook();
    const usedNames = new Set<string>();
    for (const sheet of spreadsheet.sheets) {
      let sheetName =
        sheet.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sayfa';
      while (usedNames.has(sheetName.toLowerCase())) {
        sheetName = `${sheetName.slice(0, 28)}_${usedNames.size}`;
      }
      usedNames.add(sheetName.toLowerCase());
      const ws = workbook.addWorksheet(sheetName);
      for (const [col, px] of Object.entries(parseColWidths(sheet.colWidths))) {
        ws.getColumn(Number(col) + 1).width = Math.max(1, px / 7);
      }
      const cells = await this.prisma.spreadsheetCell.findMany({
        where: { sheetId: sheet.id },
        select: {
          row: true,
          col: true,
          value: true,
          bgColor: true,
          fontColor: true,
        },
      });
      for (const c of cells) {
        const cell = ws.getCell(c.row + 1, c.col + 1);
        if (c.value) cell.value = c.value;
        if (c.bgColor && /^#[0-9A-Fa-f]{6}$/.test(c.bgColor)) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: `FF${c.bgColor.slice(1).toUpperCase()}` },
          };
        }
        if (c.fontColor && /^#[0-9A-Fa-f]{6}$/.test(c.fontColor)) {
          cell.font = {
            color: { argb: `FF${c.fontColor.slice(1).toUpperCase()}` },
          };
        }
      }
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const safeName = spreadsheet.name.replace(/[\\/:*?"<>|]/g, '_').trim();
    return { buffer, fileName: `${safeName || 'tablo'}.xlsx` };
  }

  /** Tenant izolasyonu: once tenant-scoped Spreadsheet dogrulanir (baska tenant'in
   * id'si 404), sonra sheet'in o tabloya ait oldugu kontrol edilir. */
  async assertSheet(
    id: string,
    sheetId: string,
  ): Promise<{ spreadsheetName: string; sheetName: string }> {
    const spreadsheet = await this.prisma.spreadsheet.findFirst({
      where: { id },
      select: { name: true },
    });
    if (!spreadsheet) throw notFound();
    const sheet = await this.prisma.spreadsheetSheet.findFirst({
      where: { id: sheetId, spreadsheetId: id },
      select: { name: true },
    });
    if (!sheet) throw notFound();
    return { spreadsheetName: spreadsheet.name, sheetName: sheet.name };
  }

  async create(
    filePath: string,
    type: DataSourceType,
    originalFileName: string,
    name: string | undefined,
  ): Promise<SpreadsheetDetailView> {
    const sheets = await parseSpreadsheetFile(filePath, type);
    const { userId } = TenantContext.getOrThrow();
    const finalName = name?.trim() || defaultNameFromFile(originalFileName);

    const spreadsheetId = await this.prisma.$transaction(
      async (tx) => {
        const spreadsheet = await tx.spreadsheet.create({
          data: {
            name: finalName,
            originalFileName,
            createdById: userId,
          } as never,
        });
        await this.insertSheets(tx, spreadsheet.id, sheets, userId);
        return spreadsheet.id;
      },
      { timeout: 120_000 },
    );

    await this.audit.log({
      action: 'SPREADSHEET_UPLOADED',
      entity: SPREADSHEET_AUDIT_ENTITY,
      entityId: spreadsheetId,
      meta: {
        spreadsheetName: finalName,
        fileName: originalFileName,
        sheetCount: sheets.length,
      },
    });
    return this.getById(spreadsheetId);
  }

  private async insertSheets(
    tx: Pick<TenantPrismaClient, 'spreadsheetSheet' | 'spreadsheetCell'>,
    spreadsheetId: string,
    sheets: Awaited<ReturnType<typeof parseSpreadsheetFile>>,
    userId: string,
  ): Promise<void> {
    for (const [ordinal, sheet] of sheets.entries()) {
      const created = await tx.spreadsheetSheet.create({
        data: {
          spreadsheetId,
          name: sheet.name,
          ordinal,
          rowCount: sheet.rowCount,
          colCount: sheet.colCount,
          ...(Object.keys(sheet.colWidths).length > 0
            ? { colWidths: sheet.colWidths }
            : {}),
        },
      });
      for (let i = 0; i < sheet.cells.length; i += CELL_INSERT_CHUNK_SIZE) {
        await tx.spreadsheetCell.createMany({
          data: sheet.cells.slice(i, i + CELL_INSERT_CHUNK_SIZE).map((c) => ({
            ...c,
            sheetId: created.id,
            updatedById: userId,
          })),
        });
      }
    }
  }

  /** Yuklenen dosya mevcut tablonun TUM icerigini (sayfalar, hucreler, renkler,
   * sutun genislikleri) degistirir; tablo kimligi, adi ve paylasim linkleri ayni kalir. */
  async replace(
    id: string,
    filePath: string,
    type: DataSourceType,
    originalFileName: string,
  ): Promise<SpreadsheetDetailView> {
    const existing = await this.prisma.spreadsheet.findFirst({ where: { id } });
    if (!existing) throw notFound();
    const sheets = await parseSpreadsheetFile(filePath, type);
    const { userId, tenantId } = TenantContext.getOrThrow();

    await this.prisma.$transaction(
      async (tx) => {
        await tx.spreadsheetSheet.deleteMany({ where: { spreadsheetId: id } });
        await this.insertSheets(tx, id, sheets, userId);
        await tx.spreadsheet.update({
          where: { id },
          data: { originalFileName, updatedById: userId },
        });
      },
      { timeout: 120_000 },
    );

    await this.audit.log({
      action: 'SPREADSHEET_REPLACED',
      entity: SPREADSHEET_AUDIT_ENTITY,
      entityId: id,
      meta: {
        spreadsheetName: existing.name,
        fileName: originalFileName,
        previousFileName: existing.originalFileName,
        sheetCount: sheets.length,
      },
    });
    const names = await this.userNames([userId]);
    this.realtime.emitToTenant(tenantId, SPREADSHEET_REPLACED_EVENT, {
      spreadsheetId: id,
      updatedById: userId,
      updatedByName: names.get(userId) ?? '—',
    });
    return this.getById(id);
  }

  async rename(
    id: string,
    dto: UpdateSpreadsheetDto,
  ): Promise<SpreadsheetDetailView> {
    const existing = await this.prisma.spreadsheet.findFirst({ where: { id } });
    if (!existing) throw notFound();
    const { userId } = TenantContext.getOrThrow();
    await this.prisma.spreadsheet.update({
      where: { id },
      data: { name: dto.name, updatedById: userId },
    });
    await this.audit.log({
      action: 'SPREADSHEET_RENAMED',
      entity: SPREADSHEET_AUDIT_ENTITY,
      entityId: id,
      meta: { spreadsheetName: dto.name, previousName: existing.name },
    });
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.spreadsheet.findFirst({ where: { id } });
    if (!existing) throw notFound();
    await this.prisma.spreadsheet.delete({ where: { id } });
    await this.audit.log({
      action: 'SPREADSHEET_DELETED',
      entity: SPREADSHEET_AUDIT_ENTITY,
      entityId: id,
      meta: { spreadsheetName: existing.name },
    });
  }

  async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }
}
