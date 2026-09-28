import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DataSourceType } from '@prisma/client';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { generateTemporaryPassword } from '../../core/security/temporary-password';
import { TenantContext } from '../../core/tenant/tenant-context';
import { parseFlexibleDate } from '../../core/validators/date';
import { AccountsCacheService } from '../accounts/accounts-cache.service';
import { normalizeAccountName } from '../accounts/account-name.util';
import { FileParserService } from '../datasources/file-parser.service';
import { InteractionTypeSchema } from '../interactions/dto/interaction.dto';
import { InteractionsCacheService } from '../interactions/interactions-cache.service';
import { InteractionTypeOptionsService } from '../interaction-type-options/interaction-type-options.service';
import { slugify } from '../tenants/slugify';
import type {
  InteractionImportAttributeColumnsDto,
  InteractionImportMappingDto,
} from './dto/interaction-import.dto';

const PREVIEW_SAMPLE_SIZE = 10;
const RAW_PREVIEW_ROW_COUNT = 14;

export interface InteractionImportRowError {
  row: number;
  messages: string[];
}

export interface InteractionImportResult {
  totalRows: number;
  imported: number;
  errors: InteractionImportRowError[];
}

export interface InteractionImportRawPreview {
  rows: string[][];
}

export interface InteractionImportPreview {
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

function mappingIncompleteError(message: string): AppException {
  return new AppException(
    'MAPPING_INCOMPLETE',
    message,
    HttpStatus.BAD_REQUEST,
  );
}

/** M1/M2 ile ayni ad bolme deseni (bkz. interactions.service.ts splitFreeTextName) -
 * tek satirlik bir yardimci icin ayri bir modul cikarmaya deger yok, imports.service.ts/
 * product-imports.service.ts arasindaki rowsToRecords/mappingIncompleteError ile ayni
 * duplikasyon deseni. */
function splitFreeTextName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: trimmed };
  }
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim() || trimmed,
  };
}

/** Excel'deki tarih hucreleri (seri numaralarindan cevrildikten sonra) genelde
 * kayda deger olmayan bir saat/dakika/saniye kirintisi tasiyabiliyor (kaynak dosyada
 * kullanicinin gormedigi bir zaman damgasi veya kayan nokta yuvarlama hatasi) -
 * gorusme tarihi icin sadece takvim gunu anlamli oldugundan gun basina (UTC gece
 * yarisi) sabitleniyor. */
function truncateToUtcDate(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Musteri dosyalarinin tarih kolonu her zaman gercek Excel tarih hucresi
 * olmayabilir (bkz. docs/VARSAYIMLAR.md) - bazi kaynaklarda duz metin olarak
 * "08.07.2026" gibi TR formatinda gelir, `z.coerce.date()` (native `new
 * Date(...)`) bu formati guvenilir sekilde ayristiramaz. ISO (gercek tarih
 * hucrelerinin file-parser.service.ts'te .toISOString()'a cevrilmis hali) ve
 * TR "gg.AA.yyyy" ikisini de kabul eden parseFlexibleDate kullanilir - hicbiri
 * eslesmezse satir "gecersiz tarih" hatasiyla atlanir (sessizce yanlis bir
 * tarihe dusmez).
 */
const occurredAtSchema = z
  .string()
  .min(1, 'Gorusme tarihi bos birakilamaz.')
  .transform((value, ctx) => {
    const parsed = parseFlexibleDate(value);
    if (!parsed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Gecerli bir tarih formati degil (orn. 08.07.2026): "${value}"`,
      });
      return z.NEVER;
    }
    return truncateToUtcDate(parsed);
  });

const ImportInteractionRowSchema = z
  .object({
    accountName: z.string().trim().min(1).optional(),
    contactName: z.string().trim().min(1).optional(),
    type: InteractionTypeSchema,
    subject: z.string().trim().max(200).optional(),
    /** "Konu" (subject) eklendikten sonra artik zorunlu degil. */
    notes: z.string().trim().max(5000).optional(),
    occurredAt: occurredAtSchema,
    /** Virgulle ayrilmis serbest metin - satirin geri kalaninda parseNameList ile bolunur. */
    externalParticipants: z.string().trim().optional(),
    internalParticipants: z.string().trim().optional(),
    /** "Bizden Ilgili" - birden fazla isim varsa ilki gorusmenin sahibi olur, kalani
     * internalParticipants'a eklenir (bkz. importInteractions). */
    ownerName: z.string().trim().optional(),
  })
  .refine((dto) => Boolean(dto.accountName) || Boolean(dto.contactName), {
    message: 'Firma veya kisi alanlarindan en az biri doldurulmalidir.',
    path: ['accountName'],
  });

/** Firmadan/Bizden Katilimcilar ve Bizden Ilgili hucrelerindeki virgulle ayrilmis
 * isim listesini boler (bkz. docs kullanici kararlari - ayrac virgul). */
function parseNameList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

@Injectable()
export class InteractionImportsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly fileParser: FileParserService,
    private readonly accountsCache: AccountsCacheService,
    private readonly interactionsCache: InteractionsCacheService,
    private readonly interactionTypeOptions: InteractionTypeOptionsService,
  ) {}

  private async readRows(
    filePath: string,
    type: DataSourceType,
    headerRowIndex: number,
  ): Promise<{ headers: string[]; rows: string[][] }> {
    const parsed = await this.fileParser.parse(filePath, type, headerRowIndex);
    const rows: string[][] = [];
    for await (const row of parsed.rows) {
      rows.push(row);
    }
    return { headers: parsed.headers, rows };
  }

  /**
   * headerRowIndex secilmeden once ham onizleme - accounts/product-imports ile
   * ayni desen (bkz. docs/VARSAYIMLAR.md V40).
   */
  async previewRaw(
    filePath: string,
    type: DataSourceType,
  ): Promise<InteractionImportRawPreview> {
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

  async preview(
    filePath: string,
    type: DataSourceType,
    headerRowIndex: number,
  ): Promise<InteractionImportPreview> {
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

  /**
   * "Bizden Ilgili" hucresindeki ilk isme karsilik gelen kullaniciyi coder - isim
   * tenant icinde (case-insensitive) mevcut bir kullaniciya eslenmezse otomatik olarak
   * "Temel Kullanici" rolunde bir dummy kullanici acilir (kullanici karari - bkz.
   * docs/VARSAYIMLAR.md). Ayni isim dosyada birden fazla satirda geciyorsa (M1/M2'deki
   * accountIdByName ile ayni desen) tekrar kullanici acmak yerine cache'teki id donulur.
   */
  private async resolveOwnerUserId(
    fullName: string,
    cache: Map<string, string>,
    basicRoleId: string,
    tenantSlug: string,
  ): Promise<{ userId: string; wasCreated: boolean }> {
    const key = fullName.toLocaleLowerCase('tr-TR');
    const cached = cache.get(key);
    if (cached) {
      return { userId: cached, wasCreated: false };
    }

    const existing = await this.prisma.user.findFirst({
      where: { name: { equals: fullName, mode: 'insensitive' as const } },
    });
    if (existing) {
      cache.set(key, existing.id);
      return { userId: existing.id, wasCreated: false };
    }

    const { firstName, lastName } = splitFreeTextName(fullName);
    const localPart = `${slugify(firstName)}.${slugify(lastName)}+import`;
    let email = `${localPart}@${tenantSlug}.local`;
    let attempt = 0;
    // findUnique tenant-scoped modellerde bilerek desteklenmiyor (bkz.
    // tenant-scoped.extension.ts) - email zaten global unique oldugundan findFirst yeterli.
    while (await this.prisma.user.findFirst({ where: { email } })) {
      attempt += 1;
      email = `${localPart}-${attempt}@${tenantSlug}.local`;
    }

    const passwordHash = await argon2.hash(generateTemporaryPassword(), {
      type: argon2.argon2id,
    });
    const created = await this.prisma.user.create({
      data: {
        email,
        name: fullName.trim(),
        passwordHash,
        roles: { create: [{ roleId: basicRoleId }] },
      } as never,
    });
    cache.set(key, created.id);
    return { userId: created.id, wasCreated: true };
  }

  /**
   * "Gorusme Sekli" hucresindeki deger tenant'in tanimladigi InteractionTypeOption
   * listesine karsi eslenir; bulunamazsa kullanici karariyla (bkz. docs/VARSAYIMLAR.md)
   * otomatik olarak yeni bir secenek acilir - boylece kullanicinin dosyasindaki 5 sabit
   * degerin disindaki bir "gorusme sekli" de kaybolmadan kalici hale gelir. Ayni deger
   * dosyada birden fazla satirda geciyorsa (resolveOwnerUserId/accountIdByName ile ayni
   * desen) tekrar secenek acilmaz.
   *
   * Postgres'in varsayilan "C" locale'i Turkce aksanli harflerde (Ü, Ö, Ş, Ç, İ/ı)
   * `mode: 'insensitive'` (ILIKE) karsilastirmasini yanlis sonuclandiriyor - orn.
   * "YÜZYÜZE" ile "Yüzyüze" DB seviyesinde eslesmiyor. Bu yuzden karsilastirma DB'ye
   * degil, tum etiketleri hep buyuk harfle tuttugumuz (bkz. InteractionTypeOptionsService)
   * invaryanta guvenerek JS'teki toLocaleUpperCase('tr-TR') ile normalize edilmis tam
   * esitlige birakiliyor.
   */
  private async resolveInteractionTypeLabel(
    rawType: string,
    cache: Map<string, string>,
  ): Promise<{ label: string; wasCreated: boolean }> {
    const normalized = rawType.toLocaleUpperCase('tr-TR');
    const cached = cache.get(normalized);
    if (cached) {
      return { label: cached, wasCreated: false };
    }

    const existing = await this.prisma.interactionTypeOption.findFirst({
      where: { label: normalized },
    });
    if (existing) {
      cache.set(normalized, existing.label);
      return { label: existing.label, wasCreated: false };
    }

    const created = await this.interactionTypeOptions.create({
      label: normalized,
    });
    cache.set(normalized, created.label);
    return { label: created.label, wasCreated: true };
  }

  /**
   * Her satir icin firma/kisi adi mevcut kayitlara karsi eslenir; bulunamazsa
   * M1/M2'deki (interactions.service.ts) tek-kayitlik "otomatik olustur" davranisiyla
   * ayni sekilde yeni kayit acilir. Tek fark: ayni firma adi dosyada birden fazla
   * satirda geciyorsa (toplu ice aktarmada beklenen durum) her satirda yeni bir cari
   * acmak yerine dosyanin geri kalaninda ayni kayit yeniden kullanilir.
   *
   * Firma eslestirmesi Postgres'in `mode: 'insensitive'` (ILIKE) ozelligine degil,
   * `normalizeAccountName` (bkz. account-name.util.ts) ile normalize edilmis exact-match'e
   * dayanir - cunku Account.name zaten her zaman bu normalizasyonla (TR-locale buyuk harf)
   * saklanir (imports.service.ts, interactions.service.ts) ve Postgres'in varsayilan "C"
   * locale'i Turkce aksanli harflerde (İ/ı, Ş/ş, Ğ/ğ, Ü/ü, Ö/ö, Ç/ç) ILIKE karsilastirmasini
   * yanlis sonuclandirir - orn. excel'deki "3Ab Enerji..." ile DB'deki
   * "3AB ENERJİ..." arasindaki "İ" DB seviyesinde eslesmez ve ayni firma ikinci kez
   * (duplike) olusturulur.
   */
  async importInteractions(
    createdById: string,
    filePath: string,
    type: DataSourceType,
    headerRowIndex: number,
    mapping: InteractionImportMappingDto,
    attributeColumns: InteractionImportAttributeColumnsDto,
  ): Promise<InteractionImportResult> {
    if (!mapping.type || !mapping.occurredAt) {
      throw mappingIncompleteError(
        "'Görüşme Şekli' ve 'Görüşme Tarihi' alanları bir sütuna eşlenmelidir.",
      );
    }
    if (!mapping.accountName && !mapping.contactName) {
      throw mappingIncompleteError(
        "'Firma Adı' veya 'Görüşülen Kişi' alanlarından en az biri bir sütuna eşlenmelidir.",
      );
    }

    const { headers, rows } = await this.readRows(
      filePath,
      type,
      headerRowIndex,
    );
    const records = rowsToRecords(headers, rows);
    const errors: InteractionImportRowError[] = [];
    const accountIdByName = new Map<string, string>();
    const ownerIdByName = new Map<string, string>();
    const typeLabelCache = new Map<string, string>();
    let imported = 0;
    let anyAccountCreated = false;

    // "Bizden Ilgili" bir sutuna eslendiyse, satirlarda gerekebilecek dummy kullanicilar
    // icin "Temel Kullanici" sistem rolu ve tenant slug'i (email uretimi) bir kez cekilir.
    let basicRoleId: string | undefined;
    let tenantSlug: string | undefined;
    if (mapping.ownerName) {
      const basicRole = await this.prisma.role.findFirst({
        where: { isBasic: true },
      });
      if (!basicRole) {
        throw new AppException(
          'BASIC_ROLE_NOT_FOUND',
          "'Temel Kullanici' sistem rolu bulunamadi.",
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      basicRoleId = basicRole.id;
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: TenantContext.getOrThrow().tenantId },
        select: { slug: true },
      });
      tenantSlug = tenant?.slug ?? 'tenant';
    }

    for (const [index, record] of records.entries()) {
      const fileRow = headerRowIndex + 2 + index;
      const mapped: Record<string, unknown> = {};
      for (const [target, source] of Object.entries(mapping)) {
        if (!source) {
          continue;
        }
        const value = record[source];
        mapped[target] = value === '' ? undefined : value;
      }

      const customFields: Record<string, string> = {};
      for (const column of attributeColumns) {
        const value = record[column]?.trim();
        if (value) {
          customFields[column] = value;
        }
      }

      const result = ImportInteractionRowSchema.safeParse(mapped);
      if (!result.success) {
        errors.push({
          row: fileRow,
          messages: result.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${issue.message}`,
          ),
        });
        continue;
      }
      const row = result.data;

      try {
        let accountId: string | undefined;
        if (row.accountName) {
          const normalizedName = normalizeAccountName(row.accountName);
          accountId = accountIdByName.get(normalizedName);
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
        }

        let contactId: string | undefined;
        if (row.contactName) {
          const { firstName, lastName } = splitFreeTextName(row.contactName);
          const existingContact = await this.prisma.contact.findFirst({
            where: {
              firstName: { equals: firstName, mode: 'insensitive' as const },
              lastName: { equals: lastName, mode: 'insensitive' as const },
              ...(accountId ? { accountId } : {}),
            },
          });
          if (existingContact) {
            contactId = existingContact.id;
            accountId = accountId ?? existingContact.accountId ?? undefined;
          } else {
            const createdContact = await this.prisma.contact.create({
              data: { accountId, firstName, lastName, createdById } as never,
            });
            contactId = createdContact.id;
          }
        }

        // "Bizden Ilgili" hucresinde birden fazla isim varsa ilki gorusmenin sahibi
        // olur, kalani (varsa) bizim taraf katilimci olarak eklenir (kullanici karari).
        const ownerNames = parseNameList(row.ownerName);
        let rowCreatedById = createdById;
        if (ownerNames.length > 0 && basicRoleId && tenantSlug) {
          const owner = await this.resolveOwnerUserId(
            ownerNames[0],
            ownerIdByName,
            basicRoleId,
            tenantSlug,
          );
          rowCreatedById = owner.userId;
        }

        const internalNames = new Set([
          ...parseNameList(row.internalParticipants),
          ...ownerNames.slice(1),
        ]);
        const externalNames = parseNameList(row.externalParticipants);
        const participantsData = [
          ...externalNames.map((name) => ({ name, isInternal: false })),
          ...[...internalNames].map((name) => ({ name, isInternal: true })),
        ];

        const resolvedType = await this.resolveInteractionTypeLabel(
          row.type,
          typeLabelCache,
        );

        await this.prisma.interaction.create({
          data: {
            createdById: rowCreatedById,
            accountId,
            contactId,
            type: resolvedType.label,
            subject: row.subject,
            notes: row.notes,
            occurredAt: row.occurredAt,
            ...(participantsData.length > 0
              ? { participants: { create: participantsData } }
              : {}),
            ...(Object.keys(customFields).length > 0 ? { customFields } : {}),
          } as never,
        });
        imported++;
      } catch (error) {
        errors.push({
          row: fileRow,
          messages: [
            error instanceof Error ? error.message : 'Bilinmeyen hata.',
          ],
        });
      }
    }

    if (anyAccountCreated) {
      await this.accountsCache.invalidate();
    }
    await this.interactionsCache.invalidate();

    return { totalRows: records.length, imported, errors };
  }
}
