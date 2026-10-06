/**
 * "Dışa Aktar" aksiyonlarının (firmalar/kişiler/görüşmeler...) PDF/Excel secimi -
 * `list-pdf.service.ts`/`xlsx-export.util.ts` ile ayni paylasimli yer, birden fazla
 * modul tarafindan kullanildigi icin tek bir modulun icinde tanimli degil.
 */
export type ExportFormat = 'xlsx' | 'pdf';
