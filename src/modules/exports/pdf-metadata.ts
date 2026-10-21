import { PDFDocument } from 'pdf-lib';

/** PDF'in gercek /Info/Title metadata alanina yazar. Chrome'un PDF goruntuleyicisi,
 * bir blob: URL'den acilan PDF'te "kaydet" tiklaninca onerilen dosya adini bu
 * alandan turetir (document.title ile sayfayi print etmek bu alani DOLDURMAZ -
 * denendi, blob'un kendi rastgele UUID'si dosya adi olarak kaldi; bu yuzden PDF
 * baytlarini uretildikten SONRA pdf-lib ile elle damgalamak gerekiyor). */
export async function setPdfTitleMetadata(
  pdf: Buffer,
  title: string,
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  doc.setTitle(title);
  const bytes = await doc.save();
  return Buffer.from(bytes);
}
