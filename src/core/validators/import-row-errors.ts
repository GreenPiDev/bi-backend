import type { ZodIssue } from 'zod';
import { AppException } from '../errors/app.exception';

export type ImportFieldLabels = Record<string, string>;

function resolveFieldLabel(
  path: readonly PropertyKey[],
  labels: ImportFieldLabels,
): string {
  const dotted = path
    .filter((segment): segment is string => typeof segment === 'string')
    .join('.');
  return labels[dotted] ?? labels[String(path[0] ?? '')] ?? 'Bu alan';
}

/**
 * Ice aktarma satir hatalarini normal kullanicinin anlayabilecegi Turkce cumlelere
 * cevirir. `issue.message`'a guvenilmez - ozel bir mesaj verilmemis Zod kontrolleri
 * (orn. `.max(200)` mesajsiz) Ingilizce ve teknik kalir (orn. "Invalid input:
 * expected string, received undefined"), alan adi da ham camelCase gelir (orn.
 * "taxNumber"). Bunun yerine her kod icin elle yazilmis bir Turkce sablon + verilen
 * `labels` haritasindaki kullanici dili alan adi kullanilir. Istisna: 'custom'
 * (`.refine` ile elle yazilmis) mesajlar oldugu gibi gecer, cunku onlar zaten is
 * mantigina ozgu, gelistirici tarafindan yazilmis Turkce metinlerdir.
 */
export function formatImportZodIssues(
  issues: readonly ZodIssue[],
  labels: ImportFieldLabels,
): string[] {
  return issues.map((issue) => formatImportZodIssue(issue, labels));
}

function formatImportZodIssue(
  issue: ZodIssue,
  labels: ImportFieldLabels,
): string {
  if (issue.code === 'custom') {
    return issue.message;
  }
  const label = resolveFieldLabel(issue.path, labels);
  switch (issue.code) {
    case 'invalid_type':
      return `${label} alani zorunludur.`;
    case 'too_small':
      if (issue.origin === 'array') {
        return `${label} icin en az ${issue.minimum} secim yapilmalidir.`;
      }
      if (issue.origin === 'number' || issue.origin === 'int') {
        return `${label} en az ${issue.minimum} olmalidir.`;
      }
      return `${label} en az ${issue.minimum} karakter olmalidir.`;
    case 'too_big':
      if (issue.origin === 'array') {
        return `${label} icin en fazla ${issue.maximum} secim yapilabilir.`;
      }
      if (issue.origin === 'number' || issue.origin === 'int') {
        return `${label} en fazla ${issue.maximum} olabilir.`;
      }
      return `${label} en fazla ${issue.maximum} karakter olabilir.`;
    case 'invalid_format':
      if (issue.format === 'email') {
        return `${label} gecerli bir e-posta adresi olmalidir.`;
      }
      if (issue.format === 'uuid') {
        return `${label} icin gecerli bir secim yapilmalidir.`;
      }
      return `${label} gecerli bir bicimde degil.`;
    case 'invalid_value':
      return `${label} icin gecersiz bir secim yapildi.`;
    default:
      return `${label} alani icin gecersiz bir deger girildi.`;
  }
}

/**
 * Satir islenirken (DB'ye yazarken) beklenmeyen bir hata firlarsa, ham hata mesaji
 * (orn. bir Prisma kisitlama hatasi) kullaniciya asla gosterilmez - `AppException`
 * disindaki hatalar genel bir Turkce mesajla degistirilir. quote-imports.service.ts
 * zaten bu deseni kullaniyordu, burada diger ice aktarma modulleri icin paylasimli
 * hale getirildi.
 */
export function formatUnexpectedImportRowError(error: unknown): string {
  return error instanceof AppException
    ? error.message
    : 'Bu satir islenirken beklenmeyen bir hata olustu.';
}
