import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DataSourceType } from '@prisma/client';
import * as path from 'node:path';
import { findIdsByTurkishSearch } from '../../core/db/turkish-search';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  SpreadsheetQueryDto,
  UpdateSpreadsheetDto,
} from './dto/spreadsheet.dto';
import { parseSpreadsheetFile } from './spreadsheet-file-parser';
import type {
  CompactCell,
  SpreadsheetDetailView,
  SpreadsheetSummaryView,
} from './spreadsheet.types';
import {
  CELL_INSERT_CHUNK_SIZE,
  SPREADSHEET_AUDIT_ENTITY,
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
        for (const [ordinal, sheet] of sheets.entries()) {
          const created = await tx.spreadsheetSheet.create({
            data: {
              spreadsheetId: spreadsheet.id,
              name: sheet.name,
              ordinal,
              rowCount: sheet.rowCount,
              colCount: sheet.colCount,
            },
          });
          for (let i = 0; i < sheet.cells.length; i += CELL_INSERT_CHUNK_SIZE) {
            await tx.spreadsheetCell.createMany({
              data: sheet.cells
                .slice(i, i + CELL_INSERT_CHUNK_SIZE)
                .map((c) => ({
                  ...c,
                  sheetId: created.id,
                  updatedById: userId,
                })),
            });
          }
        }
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
