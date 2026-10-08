import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Account, Contact, DataSourceType } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import type { ExportFormat } from '../../core/export-format';
import { ListPdfService } from '../../core/pdf/list-pdf.service';
import { rowsToXlsxBuffer } from '../../core/xlsx/xlsx-export.util';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import { AccountsCacheService } from '../accounts/accounts-cache.service';
import { normalizeAccountName } from '../accounts/account-name.util';
import { CreateAccountSchema } from '../accounts/dto/account.dto';
import { ContactsCacheService } from '../contacts/contacts-cache.service';
import { CreateContactSchema } from '../contacts/dto/contact.dto';
import { FileParserService } from '../datasources/file-parser.service';
import type {
  ImportAttributeColumnsDto,
  ImportMappingDto,
} from './dto/import-mapping.dto';

const PREVIEW_SAMPLE_SIZE = 10;
const RAW_PREVIEW_ROW_COUNT = 9;

export interface ImportRowError {
  row: number;
  messages: string[];
}

export interface ImportResult {
  totalRows: number;
  imported: number;
  created: number;
  updated: number;
  errors: ImportRowError[];
}

/** Dosyada (bos olmayan) gercekten eslenmis alanlar - guncellemede sadece bunlar
 * yazilir, eslenmemis/bos birakilan hucreler mevcut degeri silmez (bkz.
 * product-imports.service.ts'teki ayni desen, docs/VARSAYIMLAR.md V44/V50). */
interface ValidImportRow {
  data: Record<string, unknown>;
  providedFields: string[];
  customFields: Record<string, string>;
}

/** Firma e-posta alani ayri bir normalizasyon utility'si gerektirmeyecek kadar
 * basit - sadece bu dosyada kullanilan kucuk bir yardimci (bkz. docs/VARSAYIMLAR.md V50). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface ImportPreview {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
}

export interface ImportRawPreview {
  rows: string[][];
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

function uppercaseAccountName(mapped: Record<string, unknown>): void {
  if (typeof mapped.name === 'string') {
    mapped.name = normalizeAccountName(mapped.name);
  }
}

/** Sektor artik coklu secim (bkz. VARSAYIMLAR V41) - ice aktarma dosyasindaki tek
 * sutundan gelen deger virgul/noktali virgulle ayrilmis birden fazla sektor
 * icerebilir. */
function splitAccountSector(mapped: Record<string, unknown>): void {
  if (typeof mapped.sector !== 'string') {
    return;
  }
  const values = mapped.sector
    .split(/[,;]/)
    .map((value) => value.trim())
    .filter(Boolean);
  mapped.sector = values.length > 0 ? values : undefined;
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
    private readonly accountsCache: AccountsCacheService,
    private readonly contactsCache: ContactsCacheService,
    private readonly audit: AuditService,
    private readonly listPdf: ListPdfService,
  ) {}

  private async readRows(
    filePath: string,
    type: DataSourceType,
    headerRowIndex = 0,
  ): Promise<{ headers: string[]; rows: string[][] }> {
    const parsed = await this.fileParser.parse(filePath, type, headerRowIndex);
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

  /**
   * headerRowIndex secilmeden once ham onizleme - product-imports.service.ts'teki
   * previewRaw ile birebir ayni desen (bkz. docs/VARSAYIMLAR.md V40).
   */
  async previewAccountsRaw(
    filePath: string,
    type: DataSourceType,
  ): Promise<ImportRawPreview> {
    const parsed = await this.fileParser.parse(filePath, type, 0);
    const rows: string[][] = [parsed.headers];
    let count = 0;
    for await (const row of parsed.rows) {
      if (count >= RAW_PREVIEW_ROW_COUNT) {
        break;
      }
      rows.push(row);
      count++;
    }
    return { rows };
  }

  async previewAccountsMapped(
    filePath: string,
    type: DataSourceType,
    headerRowIndex: number,
  ): Promise<ImportPreview> {
    const { headers, rows } = await this.readRows(
      filePath,
      type,
      headerRowIndex,
    );
    const records = rowsToRecords(headers, rows);
    return {
      headers,
      sampleRows: records.slice(0, PREVIEW_SAMPLE_SIZE),
      totalRows: records.length,
    };
  }

  async importAccounts(
    createdById: string,
    filePath: string,
    type: DataSourceType,
    headerRowIndex: number,
    mapping: ImportMappingDto,
    attributeColumns: ImportAttributeColumnsDto,
  ): Promise<ImportResult> {
    if (!mapping.name) {
      throw mappingIncompleteError("'name' alani bir sutuna eslenmelidir.");
    }
    const { headers, rows } = await this.readRows(
      filePath,
      type,
      headerRowIndex,
    );
    const records = rowsToRecords(headers, rows);
    const errors: ImportRowError[] = [];
    const validRows: ValidImportRow[] = [];

    records.forEach((record, index) => {
      const mapped = applyMapping(record, mapping);
      uppercaseAccountName(mapped);
      splitAccountSector(mapped);
      const providedFields = Object.keys(mapped);

      const customFields: Record<string, string> = {};
      for (const column of attributeColumns) {
        const value = record[column]?.trim();
        if (value) {
          customFields[column] = value;
        }
      }
      if (Object.keys(customFields).length > 0) {
        mapped.customFields = customFields;
      }

      const result = CreateAccountSchema.safeParse(mapped);
      const fileRow = headerRowIndex + 2 + index;
      if (!result.success) {
        errors.push({
          row: fileRow,
          messages: result.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${issue.message}`,
          ),
        });
        return;
      }
      validRows.push({
        data: result.data as Record<string, unknown>,
        providedFields,
        customFields,
      });
    });

    let created = 0;
    let updated = 0;

    if (validRows.length > 0) {
      // Ayni excel iki kez (veya kismen kesisen iki excel) yuklenirse, ikinci
      // yuklemede eslesen firmalar tekrar eklenmez, mevcut kaydin uzerine
      // yazilir - eslestirme oncelikle VKN/TCKN'e (doluysa), yoksa normalize
      // edilmis firma adina gore yapilir. Dosyada eslenmemis alanlara
      // dokunulmaz, customFields birlestirilir (eski anahtarlar silinmez).
      // Bkz. docs/VARSAYIMLAR.md V50.
      const existingAccounts = await this.prisma.account.findMany();
      const byTaxNumber = new Map<string, Account>();
      const byName = new Map<string, Account>();
      for (const account of existingAccounts) {
        if (account.taxNumber) {
          byTaxNumber.set(account.taxNumber, account);
        }
        byName.set(normalizeAccountName(account.name), account);
      }

      for (const row of validRows) {
        const taxNumber =
          typeof row.data.taxNumber === 'string' && row.data.taxNumber
            ? row.data.taxNumber
            : undefined;
        const name = row.data.name as string;
        const existing = taxNumber
          ? byTaxNumber.get(taxNumber)
          : byName.get(normalizeAccountName(name));

        if (existing) {
          const updateData: Record<string, unknown> = {};
          for (const field of row.providedFields) {
            if (field === 'customFields') {
              continue;
            }
            updateData[field] = row.data[field];
          }
          if (Object.keys(row.customFields).length > 0) {
            const existingCustomFields =
              (existing.customFields as Record<string, string> | null) ?? {};
            updateData.customFields = {
              ...existingCustomFields,
              ...row.customFields,
            };
          }

          const account = await this.prisma.account.update({
            where: { id: existing.id },
            data: updateData as never,
          });
          if (account.taxNumber) {
            byTaxNumber.set(account.taxNumber, account);
          }
          byName.set(normalizeAccountName(account.name), account);
          updated++;

          await this.audit.log({
            action: 'UPDATE',
            entity: 'Account',
            entityId: account.id,
          });
        } else {
          const account = await this.prisma.account.create({
            data: {
              ...row.data,
              createdById,
              customFields:
                Object.keys(row.customFields).length > 0
                  ? row.customFields
                  : undefined,
            } as never,
          });
          if (account.taxNumber) {
            byTaxNumber.set(account.taxNumber, account);
          }
          byName.set(normalizeAccountName(account.name), account);
          created++;

          await this.audit.log({
            action: 'CREATE',
            entity: 'Account',
            entityId: account.id,
            meta: { name: account.name },
          });
        }
      }

      await this.accountsCache.invalidate();
    }

    return {
      totalRows: records.length,
      imported: created + updated,
      created,
      updated,
      errors,
    };
  }

  /**
   * headerRowIndex verilmemisse ham satirlar doner (kullanici baslik satirini
   * secer); verilmisse o satir baslik kabul edilip eslesme onizlemesi doner -
   * previewAccountsRaw/Mapped ile birebir ayni desen.
   */
  async previewContactsRaw(
    filePath: string,
    type: DataSourceType,
  ): Promise<ImportRawPreview> {
    const parsed = await this.fileParser.parse(filePath, type, 0);
    const rows: string[][] = [parsed.headers];
    let count = 0;
    for await (const row of parsed.rows) {
      if (count >= RAW_PREVIEW_ROW_COUNT) {
        break;
      }
      rows.push(row);
      count++;
    }
    return { rows };
  }

  async previewContactsMapped(
    filePath: string,
    type: DataSourceType,
    headerRowIndex: number,
  ): Promise<ImportPreview> {
    const { headers, rows } = await this.readRows(
      filePath,
      type,
      headerRowIndex,
    );
    const records = rowsToRecords(headers, rows);
    return {
      headers,
      sampleRows: records.slice(0, PREVIEW_SAMPLE_SIZE),
      totalRows: records.length,
    };
  }

  async importContacts(
    createdById: string,
    filePath: string,
    type: DataSourceType,
    headerRowIndex: number,
    mapping: ImportMappingDto,
    attributeColumns: ImportAttributeColumnsDto,
  ): Promise<ImportResult> {
    if (!mapping.firstName || !mapping.lastName) {
      throw mappingIncompleteError(
        "'firstName' ve 'lastName' alanlari bir sutuna eslenmelidir.",
      );
    }
    const { headers, rows } = await this.readRows(
      filePath,
      type,
      headerRowIndex,
    );
    const records = rowsToRecords(headers, rows);
    const errors: ImportRowError[] = [];
    const validRows: ValidImportRow[] = [];
    // 'Firma' sutunu isimle eslestirip var olan Account'u bulur, yoksa minimal
    // bir Account kaydi (sadece isim) olusturur - interaction-imports.service.ts'teki
    // accountIdByName ile birebir ayni desen (bkz. docs/VARSAYIMLAR.md V58).
    const accountIdByName = new Map<string, string>();
    let anyAccountCreated = false;

    for (const [index, record] of records.entries()) {
      const mapped = applyMapping(record, mapping);
      const accountNameRaw =
        typeof mapped.accountName === 'string' ? mapped.accountName : undefined;
      delete mapped.accountName;

      if (accountNameRaw) {
        const normalizedName = normalizeAccountName(accountNameRaw);
        let accountId = accountIdByName.get(normalizedName);
        if (!accountId) {
          const existing = await this.prisma.account.findFirst({
            where: { name: normalizedName },
          });
          if (existing) {
            accountId = existing.id;
          } else {
            const created = await this.prisma.account.create({
              data: { name: normalizedName, createdById } as never,
            });
            accountId = created.id;
            anyAccountCreated = true;
          }
          accountIdByName.set(normalizedName, accountId);
        }
        mapped.accountId = accountId;
      }

      const providedFields = Object.keys(mapped);

      const customFields: Record<string, string> = {};
      for (const column of attributeColumns) {
        const value = record[column]?.trim();
        if (value) {
          customFields[column] = value;
        }
      }
      if (Object.keys(customFields).length > 0) {
        mapped.customFields = customFields;
      }

      const result = CreateContactSchema.safeParse(mapped);
      const fileRow = headerRowIndex + 2 + index;
      if (!result.success) {
        errors.push({
          row: fileRow,
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
            row: fileRow,
            messages: [
              `accountId: firma bulunamadi (${result.data.accountId})`,
            ],
          });
          continue;
        }
      }
      validRows.push({
        data: result.data as Record<string, unknown>,
        providedFields,
        customFields,
      });
    }

    let created = 0;
    let updated = 0;

    if (validRows.length > 0) {
      // Ayni dosya iki kez yuklenirse eslesen kisiler tekrar eklenmez, mevcut
      // kaydin uzerine yazilir - eslestirme oncelikle e-postaya (doluysa,
      // kucuk/buyuk harf yok sayilarak), yoksa ad+soyad+firma kombinasyonuna
      // gore yapilir. Ne e-posta ne firma varsa (sadece ad-soyad) satir
      // guvenilir sekilde eslestirilemez - farkli iki kisinin yanlislikla
      // birlestirilmesini onlemek icin boyle satirlar her zaman yeni kayit
      // olarak eklenir. Bkz. docs/VARSAYIMLAR.md V50.
      const existingContacts = await this.prisma.contact.findMany();
      const byEmail = new Map<string, Contact>();
      const byNameAccount = new Map<string, Contact>();
      const nameAccountKey = (
        firstName: string,
        lastName: string,
        accountId: string,
      ) =>
        `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}|${accountId}`;
      for (const contact of existingContacts) {
        if (contact.email) {
          byEmail.set(normalizeEmail(contact.email), contact);
        }
        if (contact.accountId) {
          byNameAccount.set(
            nameAccountKey(
              contact.firstName,
              contact.lastName,
              contact.accountId,
            ),
            contact,
          );
        }
      }

      for (const row of validRows) {
        const email =
          typeof row.data.email === 'string' && row.data.email
            ? normalizeEmail(row.data.email)
            : undefined;
        const accountId =
          typeof row.data.accountId === 'string'
            ? row.data.accountId
            : undefined;
        const firstName = row.data.firstName as string;
        const lastName = row.data.lastName as string;

        let existing: Contact | undefined;
        if (email) {
          existing = byEmail.get(email);
        } else if (accountId) {
          existing = byNameAccount.get(
            nameAccountKey(firstName, lastName, accountId),
          );
        }

        if (existing) {
          const updateData: Record<string, unknown> = {};
          for (const field of row.providedFields) {
            if (field === 'customFields') {
              continue;
            }
            updateData[field] = row.data[field];
          }
          if (Object.keys(row.customFields).length > 0) {
            const existingCustomFields =
              (existing.customFields as Record<string, string> | null) ?? {};
            updateData.customFields = {
              ...existingCustomFields,
              ...row.customFields,
            };
          }
          const contact = await this.prisma.contact.update({
            where: { id: existing.id },
            data: updateData as never,
          });
          if (contact.email) {
            byEmail.set(normalizeEmail(contact.email), contact);
          }
          if (contact.accountId) {
            byNameAccount.set(
              nameAccountKey(
                contact.firstName,
                contact.lastName,
                contact.accountId,
              ),
              contact,
            );
          }
          updated++;

          await this.audit.log({
            action: 'UPDATE',
            entity: 'Contact',
            entityId: contact.id,
          });
        } else {
          const contact = await this.prisma.contact.create({
            data: { ...row.data, createdById } as never,
          });
          if (contact.email) {
            byEmail.set(normalizeEmail(contact.email), contact);
          }
          if (contact.accountId) {
            byNameAccount.set(
              nameAccountKey(
                contact.firstName,
                contact.lastName,
                contact.accountId,
              ),
              contact,
            );
          }
          created++;

          await this.audit.log({
            action: 'CREATE',
            entity: 'Contact',
            entityId: contact.id,
            meta: { firstName: contact.firstName, lastName: contact.lastName },
          });
        }
      }

      await this.contactsCache.invalidate();
    }

    if (anyAccountCreated) {
      await this.accountsCache.invalidate();
    }

    return {
      totalRows: records.length,
      imported: created + updated,
      created,
      updated,
      errors,
    };
  }

  async exportAccounts(format: ExportFormat): Promise<Buffer> {
    const accounts = await this.prisma.account.findMany({
      orderBy: { name: 'asc' },
    });
    const rows = accounts.map((account) => ({
      Ad: account.name,
      'Vergi No': account.taxNumber ?? '',
      'Vergi Dairesi': account.taxOffice ?? '',
      Sektor: (account.sector ?? []).join(', '),
      'Web Sitesi': account.website ?? '',
      Telefon: account.phone ?? '',
      'E-posta': account.email ?? '',
      Adres: account.address ?? '',
      Sehir: account.city ?? '',
    }));
    return format === 'pdf'
      ? this.listPdf.render('Firmalar', rows)
      : rowsToXlsxBuffer(rows, 'Firmalar');
  }

  async exportContacts(format: ExportFormat): Promise<Buffer> {
    const contacts = await this.prisma.contact.findMany({
      orderBy: { lastName: 'asc' },
      include: { account: { select: { name: true } } },
    });
    const rows = contacts.map((contact) => ({
      Ad: contact.firstName,
      Soyad: contact.lastName,
      Unvan: contact.title ?? '',
      Departman: contact.department ?? '',
      'E-posta': contact.email ?? '',
      Telefon: contact.phone ?? '',
      Firma: contact.account?.name ?? '',
    }));
    return format === 'pdf'
      ? this.listPdf.render('Kisiler', rows)
      : rowsToXlsxBuffer(rows, 'Kisiler');
  }
}
