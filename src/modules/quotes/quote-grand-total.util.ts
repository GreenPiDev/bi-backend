/**
 * `/teklifler?tab=quotes` listesini "genel toplama gore" siralamak icin tek bir sayisal
 * deger uretir - bi-frontend/src/lib/quote-totals.ts'teki quoteGrandTotalDisplay ile
 * ayni hesaplama mantigi (coklu para birimi -> quoteCurrency'ye cevrim), ama string
 * yerine ham sayi dondurur. Iki repo kendi kopyasini tutar (bkz. CLAUDE.md SS3/SS4,
 * packages/shared yok).
 */

interface QuoteItemForGrandTotal {
  quantity: unknown;
  unitPrice: unknown;
  discountPct: unknown;
  vatPct: unknown;
  currency: string;
}

export interface QuoteForGrandTotalSort {
  itemsEntryMode: 'ITEMIZED' | 'MANUAL_TOTAL';
  manualSubtotal: unknown;
  manualVatAmount: unknown;
  manualCurrency: string | null;
  quoteCurrency: string;
  exchangeRates: unknown;
  items: QuoteItemForGrandTotal[];
}

/** Prisma Decimal alanlarinda `Number(x)` yerine kullanilir - decimal.js'in
 * `valueOf()`'u kasitli olarak hata firlatir (bkz. quotes.service.ts'teki
 * `.toNumber()` kullanimlari), bu yuzden once onu deneriz. */
function toNumber(value: unknown): number {
  if (
    value !== null &&
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof (value as { toNumber: unknown }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

function lineTotal(item: QuoteItemForGrandTotal): number {
  const quantity = toNumber(item.quantity);
  const unitPrice = toNumber(item.unitPrice);
  const discountPct = toNumber(item.discountPct);
  const vatPct = toNumber(item.vatPct);
  const subtotal = quantity * unitPrice * (1 - discountPct / 100);
  return subtotal * (1 + vatPct / 100);
}

/** Sadece siralama icin kullanilir - para birimi karisik tekliflerde kur eksikse
 * (veya hic kur girilmemisse) her grubun ham tutari donusturulmeden toplanir, bu
 * gostergede kucuk bir yanlisliga yol acabilir ama ekranda gosterilen deger
 * degismez (quoteGrandTotalDisplay string gosterimini etkilemiyor). */
export function computeQuoteGrandTotalForSort(
  quote: QuoteForGrandTotalSort,
): number {
  if (quote.itemsEntryMode === 'MANUAL_TOTAL') {
    return (
      toNumber(quote.manualSubtotal ?? 0) + toNumber(quote.manualVatAmount ?? 0)
    );
  }

  const totalsByCurrency = new Map<string, number>();
  for (const item of quote.items) {
    const currency = item.currency || 'TRY';
    totalsByCurrency.set(
      currency,
      (totalsByCurrency.get(currency) ?? 0) + lineTotal(item),
    );
  }

  const rates =
    (quote.exchangeRates as { rates?: Record<string, number> } | null)?.rates ??
    {};
  let converted = 0;
  for (const [currency, amount] of totalsByCurrency) {
    if (currency === quote.quoteCurrency) {
      converted += amount;
      continue;
    }
    const rate = rates[currency];
    converted += rate !== undefined ? amount * rate : amount;
  }
  return converted;
}
