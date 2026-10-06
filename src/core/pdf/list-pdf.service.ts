import { Injectable } from '@nestjs/common';
import { chromium } from 'playwright';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHtml(title: string, rows: Record<string, string>[]): string {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const headerHtml = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const bodyHtml = rows
    .map(
      (row) =>
        `<tr>${headers.map((h) => `<td>${escapeHtml(row[h] ?? '')}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1f2937; }
      h1 { font-size: 16px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; }
      th { background: #f3f4f6; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  </body>
</html>`;
}

/**
 * `drawing-pdf.service.ts` ile ayni desen: statik HTML'i Playwright'a yukleyip
 * PDF'e cevirir - auth gerektiren canli sayfa render'i (quote/dashboard-pdf) yerine,
 * veri zaten sunucu tarafinda elde oldugundan (exportAccounts/exportContacts/
 * exportInteractions'taki ayni satirlar) sadece basit bir tablo basar. `core/`'a
 * tasindi (ilk kullanimi modules/imports'tu, Faz 11c'nin interactions export'u ikinci
 * kullanici oldu) - birden fazla modul tarafindan paylasilan jenerik bir yetenek oldugu
 * icin StorageModule ile ayni @Global() desende core/pdf/pdf.module.ts'den sunulur.
 */
@Injectable()
export class ListPdfService {
  async render(title: string, rows: Record<string, string>[]): Promise<Buffer> {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(buildHtml(title, rows), { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
