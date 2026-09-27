const TR_DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})(\s+\d{2}:\d{2}(:\d{2})?)?$/;
const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * ISO ("2026-07-08T10:44:33.000Z", ornegin gercek Excel tarih hucrelerinin
 * file-parser.service.ts'te .toISOString()'a cevrilmis hali) veya TR
 * "gg.AA.yyyy" / "gg.AA.yyyy ss:dd(:ss)" (ornegin duz metin olarak yazilmis
 * bir tarih hucresi) formatlarini ayristirir; ikisi de degilse null doner
 * (native `new Date(...)` gibi sessizce yanlis bir tarihe dusmez).
 * type-inference.service.ts (BI veri alimi) ile ayni desen - ikinci
 * kullanicisiyla (interaction-imports.service.ts) buraya cikarildi, bkz.
 * image-upload-validation.ts ile ayni desen.
 */
export function parseFlexibleDate(value: string): Date | null {
  const v = value.trim();
  if (ISO_DATE_PATTERN.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const match = TR_DATE_PATTERN.exec(v);
  if (!match) {
    return null;
  }
  const [, dd, mm, yyyy, rawTime] = match;
  const day = Number(dd);
  const month = Number(mm);
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (rawTime) {
    const timeParts = rawTime.trim().split(':').map(Number);
    [hours, minutes, seconds = 0] = timeParts;
  }
  const d = new Date(
    Date.UTC(Number(yyyy), month - 1, day, hours, minutes, seconds),
  );
  // Date.UTC tasan gun/ay degerlerini (orn. 31.02) sessizce bir sonraki aya
  // tasir - girilen takvim gununun degismeden geri geldigini dogrula.
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== Number(yyyy) ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

/** M9: hatirlatma icin "gecmis tarih" kisitlanir, "gecmis an" degil - bugunun herhangi bir
 * saati (submit sirasindaki birkac saniyelik gecikme dahil) hala gecerli sayilmali. */
export function isPastCalendarDay(date: Date, now: Date = new Date()): boolean {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfGivenDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  return startOfGivenDay.getTime() < startOfToday.getTime();
}
