import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DataSourceType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { CreateAccountSchema } from '../accounts/dto/account.dto';
import { CreateContactSchema } from '../contacts/dto/contact.dto';
import { FileParserService } from '../datasources/file-parser.service';
import type { ImportMappingDto } from './dto/import-mapping.dto';

const PREVIEW_SAMPLE_SIZE = 10;

export interface ImportRowError {
  row: number;
  messages: string[];
}

export interface ImportResult {
  totalRows: number;
  imported: number;
  errors: ImportRowError[];
}

export interface ImportPreview {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
}

function rowsToRecords(
  headers: string[],
  rows: string[][],
): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = row[i] ?? '';
    });
    return record;
  });
}

function applyMapping(
  row: Record<string, string>,
  mapping: ImportMappingDto,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [target, source] of Object.entries(mapping)) {
    if (!source) {
      continue;
    }
    const value = row[source];
    mapped[target] = value === '' ? undefined : value;
  }
  return mapped;
}

function mappingIncompleteError(message: string): AppException {
  return new AppException(
    'MAPPING_INCOMPLETE',
    message,
    HttpStatus.BAD_REQUEST,
  );
}

@Injectable()
export class ImportsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly fileParser: FileParserService,
  ) {}

  private async readRows(
    filePath: string,
    type: DataSourceType,
  ): Promise<{ headers: string[]; rows: string[][] }> {
    const parsed = await this.fileParser.parse(filePath, type);
    const rows: string[][] = [];
    for await (const row of parsed.rows) {
      rows.push(row);
    }
    return { headers: parsed.headers, rows };
  }

  async preview(
    filePath: string,
    type: DataSourceType,
  ): Promise<ImportPreview> {
    const { headers, rows } = await this.readRows(filePath, type);
    const records = rowsToRecords(headers, rows);
    return {
      headers,
      sampleRows: records.slice(0, PREVIEW_SAMPLE_SIZE),
      totalRows: records.length,
    };
  }

  async importAccounts(
    filePath: string,
    type: DataSourceType,
    mapping: ImportMappingDto,
  ): Promise<ImportResult> {
    if (!mapping.name) {
      throw mappingIncompleteError("'name' alani bir sutuna eslenmelidir.");
    }
    const { headers, rows } = await this.readRows(filePath, type);
    const records = rowsToRecords(headers, rows);
    const errors: ImportRowError[] = [];
    const validRows: Record<string, unknown>[] = [];

    records.forEach((record, index) => {
      const mapped = applyMapping(record, mapping);
      const result = CreateAccountSchema.safeParse(mapped);
      if (!result.success) {
        errors.push({
          row: index + 2,
          messages: result.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${issue.message}`,
          ),
        });
        return;
      }
      validRows.push(result.data);
    });

    if (validRows.length > 0) {
      await this.prisma.account.createMany({ data: validRows as never });
    }

    return { totalRows: records.length, imported: validRows.length, errors };
  }

  async importContacts(
    filePath: string,
    type: DataSourceType,
    mapping: ImportMappingDto,
  ): Promise<ImportResult> {
    if (!mapping.firstName || !mapping.lastName) {
      throw mappingIncompleteError(
        "'firstName' ve 'lastName' alanlari bir sutuna eslenmelidir.",
      );
    }
    const { headers, rows } = await this.readRows(filePath, type);
    const records = rowsToRecords(headers, rows);
    const errors: ImportRowError[] = [];
    const validRows: Record<string, unknown>[] = [];

    for (const [index, record] of records.entries()) {
      const mapped = applyMapping(record, mapping);
      const result = CreateContactSchema.safeParse(mapped);
      if (!result.success) {
        errors.push({
          row: index + 2,
          messages: result.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${issue.message}`,
          ),
        });
        continue;
      }
      if (result.data.accountId) {
        const account = await this.prisma.account.findFirst({
          where: { id: result.data.accountId },
        });
        if (!account) {
          errors.push({
            row: index + 2,
            messages: [
              `accountId: firma bulunamadi (${result.data.accountId})`,
            ],
          });
          continue;
        }
      }
      validRows.push(result.data);
    }

    if (validRows.length > 0) {
      await this.prisma.contact.createMany({ data: validRows as never });
    }

    return { totalRows: records.length, imported: validRows.length, errors };
  }

  async exportAccounts(): Promise<Buffer> {
    const accounts = await this.prisma.account.findMany({
      orderBy: { name: 'asc' },
    });
    const rows = accounts.map((account) => ({
      Ad: account.name,
      'Vergi No': account.taxNumber ?? '',
      'Vergi Dairesi': account.taxOffice ?? '',
      Sektor: account.sector ?? '',
      'Web Sitesi': account.website ?? '',
      Telefon: account.phone ?? '',
      'E-posta': account.email ?? '',
      Adres: account.address ?? '',
      Sehir: account.city ?? '',
    }));
    return this.toXlsxBuffer(rows, 'Firmalar');
  }

  async exportContacts(): Promise<Buffer> {
    const contacts = await this.prisma.contact.findMany({
      orderBy: { lastName: 'asc' },
      include: { account: { select: { name: true } } },
    });
    const rows = contacts.map((contact) => ({
      Ad: contact.firstName,
      Soyad: contact.lastName,
      Unvan: contact.title ?? '',
      'E-posta': contact.email ?? '',
      Telefon: contact.phone ?? '',
      Firma: contact.account?.name ?? '',
    }));
    return this.toXlsxBuffer(rows, 'Kisiler');
  }

  private async toXlsxBuffer(
    rows: Record<string, string>[],
    sheetName: string,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);
    if (rows.length > 0) {
      worksheet.columns = Object.keys(rows[0]).map((key) => ({
        header: key,
        key,
      }));
      worksheet.addRows(rows);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
