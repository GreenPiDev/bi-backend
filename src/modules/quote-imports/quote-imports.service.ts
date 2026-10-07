import { Inject, Injectable } from '@nestjs/common';
import type { DataSourceType, Quote } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { normalizeAccountName } from '../accounts/account-name.util';
import { FileParserService } from '../datasources/file-parser.service';
import { AuditService } from '../audit/audit.service';
import { QuotesCacheService } from '../quotes/quotes-cache.service';
import {
  normalizeCurrency,
  parseImportNumber,
} from '../product-imports/number-format';
import type {
  NumberFormat,
  QuoteImportAttributeColumnsDto,
  QuoteImportMappingDto,
} from './dto/quote-import.dto';

const DEFAULT_CURRENCY = 'TRY';

const PREVIEW_SAMPLE_SIZE = 10;
const RAW_PREVIEW_ROW_COUNT = 14;

/** M1/M2'deki (interactions.service.ts) ve interaction-imports.service.ts'teki ayni
 * "Ahmet Yilmaz" -> {firstName:'Ahmet', lastName:'Yilmaz'} bolme mantigi - kucuk/saf
 * oldugu icin burada tekrar tanimlandi (modul kendi icinde bagimsiz kalsin diye). */
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

export interface QuoteImportRowError {
  row: number;
  messages: string[];
}

export interface QuoteImportResult {
  totalRows: number;
  imported: number;
  created: number;
  updated: number;
  errors: QuoteImportRowError[];
}

export interface QuoteImportRawPreview {
  rows: string[][];
}

export interface QuoteImportPreview {
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

type ImportTx = Pick<
  TenantPrismaClient,
  'account' | 'quote' | 'user' | 'contact' | 'quoteStatusHistory'
>;

interface ValidImportRow {
  accountName: string;
  quoteNumber: string;
  quoteDate: Date;
  title: string | null;
  subtotal: number;
  vatAmount: number;
  /** Satir bazinda - dosyada kolon yoksa ya da bos ise DEFAULT_CURRENCY'ye
   * dusulur (bkz. docs/VARSAYIMLAR.md - eskiden sihirbaz-geneli tek bir secimdi,
   * kullanici her teklifin kendi para birimini tasimasini istedi). */
  currency: string;
  /** "Gonderen" (bkz. Quote.senderId) - serbest metin, User.name'e karsi
   * case-insensitive eslenir; eslesme yoksa senderId dokunulmadan kalir (bkz.
   * docs/VARSAYIMLAR.md - interaction-imports'taki aksine burada eslesmezse
   * otomatik kullanici OLUSTURULMAZ, Quote.senderId zaten nullable). */
  senderName: string | null;
  /** "Muhatap Kisi" (bkz. Quote.contactId) - resolveAccountId'den sonra bulunan
   * accountId'ye bagli Contact'lar icinde aranir, yoksa M1 deseniyle (bkz.
   * interactions.service.ts) otomatik olusturulur. */
  contactName: string | null;
  attributes: Record<string, string>;
}

@Injectable()
export class QuoteImportsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly fileParser: FileParserService,
    private readonly quotesCache: QuotesCacheService,
    private readonly audit: AuditService,
  ) {}

  /**
   * headerRowIndex secilmeden once ham onizleme - product-imports.previewRaw ile
   * ayni desen, kullanici hangi satirin gercek baslik oldugunu goze bakarak secer.
   */
  async previewRaw(
    filePath: string,
    type: DataSourceType,
  ): Promise<QuoteImportRawPreview> {
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
  ): Promise<QuoteImportPreview> {
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
   * Kaynak dosyada satir bazli urun/miktar/birim fiyat kolonu olmadigi icin (bkz.
   * docs/VARSAYIMLAR.md) bu akistan dogan teklifler hep itemsEntryMode='MANUAL_TOTAL'
   * ile acilir, items dokunulmaz (bos kalir). QuotesService.create() KASITLI olarak
   * cagrilmiyor - o metod otomatik quoteNumber uretir ve en az 1 kalem zorunlu tutar,
   * ikisi de bu import icin uygun degil (orijinal teklif no korunmali, kalem yok).
   */
  async importQuotes(
    filePath: string,
    type: DataSourceType,
    headerRowIndex: number,
    mapping: QuoteImportMappingDto,
    attributeColumns: QuoteImportAttributeColumnsDto,
    numberFormat: NumberFormat,
    createdById: string,
  ): Promise<QuoteImportResult> {
    const { headers, rows } = await this.readRows(
      filePath,
      type,
      headerRowIndex,
    );
    const records = rowsToRecords(headers, rows);
    const errors: QuoteImportRowError[] = [];
    const validRows: { fileRow: number; data: ValidImportRow }[] = [];

    records.forEach((record, index) => {
      const fileRow = headerRowIndex + 2 + index;
      const messages: string[] = [];

      const accountNameRaw = mapping.accountName
        ? record[mapping.accountName]
        : undefined;
      const accountName = accountNameRaw?.trim();
      if (!accountName) {
        messages.push("'Firma Adi' alani zorunludur.");
      }

      const quoteNumber = mapping.quoteNumber
        ? record[mapping.quoteNumber]?.trim()
        : undefined;
      if (!quoteNumber) {
        messages.push("'Teklif No' alani zorunludur.");
      }

      const quoteDateRaw = mapping.quoteDate
        ? record[mapping.quoteDate]?.trim()
        : undefined;
      const quoteDate = quoteDateRaw ? new Date(quoteDateRaw) : undefined;
      if (!quoteDateRaw || !quoteDate || Number.isNaN(quoteDate.getTime())) {
        messages.push("'Tarih' alani gecerli bir tarih olmalidir.");
      }

      const subtotalRaw = mapping.subtotal
        ? record[mapping.subtotal]
        : undefined;
      const subtotal = parseImportNumber(subtotalRaw, numberFormat);
      if (subtotal === undefined) {
        messages.push("'Tutar' alani gecerli bir sayi olmalidir.");
      }

      const totalWithVatRaw = mapping.totalWithVat
        ? record[mapping.totalWithVat]
        : undefined;
      const totalWithVat = parseImportNumber(totalWithVatRaw, numberFormat);

      if (messages.length > 0) {
        errors.push({ row: fileRow, messages });
        return;
      }

      const title = mapping.title
        ? record[mapping.title]?.trim() || null
        : null;
      const currencyRaw = mapping.currency
        ? record[mapping.currency]?.trim()
        : undefined;
      const currency = currencyRaw
        ? normalizeCurrency(currencyRaw)
        : DEFAULT_CURRENCY;
      const senderName = mapping.senderName
        ? record[mapping.senderName]?.trim() || null
        : null;
      const contactName = mapping.contactName
        ? record[mapping.contactName]?.trim() || null
        : null;

      const attributes: Record<string, string> = {};
      for (const column of attributeColumns) {
        const value = record[column];
        if (value) {
          attributes[column] = value;
        }
      }

      validRows.push({
        fileRow,
        data: {
          accountName: accountName!,
          quoteNumber: quoteNumber!,
          quoteDate: quoteDate!,
          title,
          subtotal: subtotal!,
          vatAmount: totalWithVat !== undefined ? totalWithVat - subtotal! : 0,
          currency,
          senderName,
          contactName,
          attributes,
        },
      });
    });

    let created = 0;
    let updated = 0;

    for (const row of validRows) {
      try {
        const wasCreated = await this.prisma.$transaction((tx) =>
          this.upsertQuote(tx, row.data, createdById),
        );
        if (wasCreated) {
          created++;
        } else {
          updated++;
        }
      } catch (error) {
        errors.push({
          row: row.fileRow,
          messages: [
            error instanceof AppException
              ? error.message
              : 'Satir ice aktarilirken beklenmeyen bir hata olustu.',
          ],
        });
      }
    }

    if (created + updated > 0) {
      await this.quotesCache.invalidate();
    }

    return {
      totalRows: records.length,
      imported: created + updated,
      created,
      updated,
      errors,
    };
  }

  /** Firma adina gore bul-yoksa-olustur (M1/M2 deseniyle ayni normalizasyon,
   * `interactions.service.ts`'teki gibi her satirda yeniden create ETMEZ -
   * 473 satirlik bir dosyada ayni firma onlarca kez tekrarlanacagi icin once arar). */
  private async resolveAccountId(
    tx: ImportTx,
    accountName: string,
    createdById: string,
  ): Promise<string> {
    const normalized = normalizeAccountName(accountName);
    const existing = await tx.account.findFirst({
      where: { name: normalized },
    });
    if (existing) {
      return existing.id;
    }
    const created = await tx.account.create({
      data: { name: normalized, createdById } as never,
    });
    return created.id;
  }

  /** "Gonderen" serbest metnini User.name'e karsi case-insensitive esler (ayni
   * `mode: 'insensitive'` deseni interaction-imports.service.ts'teki resolveOwnerUserId
   * ile) - ama orasindan farkli olarak eslesme yoksa YENI KULLANICI OLUSTURULMAZ: Quote.
   * senderId zaten nullable ve Quote.createdById (import eden kullanici) ayri bir alan,
   * bu yuzden ucuz olmayan "login hesabi mint etme" ile ayni gerekce burada yok (bkz.
   * docs/VARSAYIMLAR.md). */
  private async resolveSenderId(
    tx: ImportTx,
    senderName: string,
  ): Promise<string | undefined> {
    const user = await tx.user.findFirst({
      where: { name: { equals: senderName, mode: 'insensitive' as const } },
    });
    return user?.id;
  }

  /** "Muhatap Kisi" serbest metnini, resolveAccountId'den gelen hesaba bagli Contact'lar
   * icinde arar; bulunamazsa M1 deseniyle (bkz. interactions.service.ts) otomatik olarak
   * o hesaba bagli yeni bir Contact acar. */
  private async resolveContactId(
    tx: ImportTx,
    accountId: string,
    contactName: string,
    createdById: string,
  ): Promise<string> {
    const { firstName, lastName } = splitFreeTextName(contactName);
    const existing = await tx.contact.findFirst({
      where: {
        accountId,
        firstName: { equals: firstName, mode: 'insensitive' as const },
        lastName: { equals: lastName, mode: 'insensitive' as const },
      },
    });
    if (existing) {
      return existing.id;
    }
    const created = await tx.contact.create({
      data: { accountId, firstName, lastName, createdById } as never,
    });
    return created.id;
  }

  /** (tenantId, quoteNumber) uzerinden upsert - V44/V50'deki ayni "tekrar yuklenirse
   * guncelle" deseni. true donerse yeni kayit acildi, false donerse mevcut guncellendi. */
  private async upsertQuote(
    tx: ImportTx,
    data: ValidImportRow,
    createdById: string,
  ): Promise<boolean> {
    const accountId = await this.resolveAccountId(
      tx,
      data.accountName,
      createdById,
    );
    const existing = await tx.quote.findFirst({
      where: { quoteNumber: data.quoteNumber },
    });

    const sharedFields: Record<string, unknown> = {
      accountId,
      quoteDate: data.quoteDate,
      title: data.title,
      manualSubtotal: data.subtotal,
      manualVatAmount: data.vatAmount,
      manualCurrency: data.currency,
    };
    // Esleme bu satirda bos/eslesmemisse mevcut senderId/contactId'yi
    // NULL'lamiyoruz - sadece gercekten cozumlenebilmisse yaziyoruz (kullanici
    // normal /teklifler ekranindan elle setlediyse bir sonraki tekrar-import bunu
    // silmemeli, bkz. docs/VARSAYIMLAR.md).
    if (data.senderName) {
      const senderId = await this.resolveSenderId(tx, data.senderName);
      if (senderId) {
        sharedFields.senderId = senderId;
      }
    }
    if (data.contactName) {
      sharedFields.contactId = await this.resolveContactId(
        tx,
        accountId,
        data.contactName,
        createdById,
      );
    }

    let quote: Quote;
    if (existing) {
      // Ayni dosya (veya kismen kesisen iki dosya) tekrar yuklenirse, eslenmemis
      // eski attribute anahtarlari silinmez - sadece bu satirda gelen anahtarlar
      // uzerine yazilir (product-imports.service.ts'teki ayni birlestirme deseni).
      const existingAttributes =
        (existing.attributes as Record<string, string> | null) ?? {};
      const mergedAttributes = { ...existingAttributes, ...data.attributes };
      quote = await tx.quote.update({
        where: { id: existing.id },
        data: {
          ...sharedFields,
          attributes:
            Object.keys(mergedAttributes).length > 0
              ? mergedAttributes
              : undefined,
        } as never,
      });
      await this.audit.log({
        action: 'UPDATE',
        entity: 'Quote',
        entityId: quote.id,
      });
      return false;
    }

    quote = await tx.quote.create({
      data: {
        ...sharedFields,
        quoteNumber: data.quoteNumber,
        itemsEntryMode: 'MANUAL_TOTAL',
        // Durum artik kolon eslemesinden gelmiyor (bkz. docs/VARSAYIMLAR.md) - import'tan
        // acilan HER teklif sabit olarak UNSPECIFIED ile baslar, sadece olusturmada
        // yazilir (tekrar import'ta kullanicinin normal ekrandan degistirdigi durum
        // geri UNSPECIFIED'a dusurulmez).
        status: 'UNSPECIFIED',
        attributes:
          Object.keys(data.attributes).length > 0 ? data.attributes : undefined,
        createdById,
      } as never,
    });
    await tx.quoteStatusHistory.create({
      data: {
        quoteId: quote.id,
        status: 'UNSPECIFIED',
        createdById,
      } as never,
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'Quote',
      entityId: quote.id,
      meta: { quoteNumber: quote.quoteNumber },
    });
    return true;
  }

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
}
