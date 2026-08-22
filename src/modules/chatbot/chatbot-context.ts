import type { Dashboard, Dataset, DatasetField } from '@prisma/client';

export interface DatasetSummaryForChat {
  id: string;
  name: string;
  fields: { name: string; label: string; type: string; role: string }[];
}

export function buildDatasetSummaries(
  datasets: (Dataset & { fields: DatasetField[] })[],
): DatasetSummaryForChat[] {
  return datasets.map((dataset) => ({
    id: dataset.id,
    name: dataset.name,
    fields: dataset.fields
      .filter((field) => field.isVisible)
      .map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        role: field.role,
      })),
  }));
}

/**
 * OpenAI'a gonderilecek sistem promptu. Bu tenant disinda hicbir veri
 * (baska tenant'in dataset/dashboard adi dahil) buraya asla girmez -
 * cagiran servis datasets/dashboards listelerini TENANT_PRISMA (otomatik
 * tenantId filtreli) uzerinden aliyor olmali.
 */
export function buildSystemPrompt(
  datasets: DatasetSummaryForChat[],
  dashboards: Pick<Dashboard, 'id' | 'name'>[],
): string {
  const datasetLines = datasets.length
    ? datasets
        .map((d) => {
          const fieldList = d.fields
            .map(
              (f) =>
                `"${f.name}" [görünen adı: "${f.label}"] (${f.role.toLowerCase()}, ${f.type.toLowerCase()})`,
            )
            .join(', ');
          return `- "${d.name}" [datasetId: "${d.id}"]: ${fieldList || 'alan yok'}`;
        })
        .join('\n')
    : '(bu sirkette henuz yuklenmis veri yok)';

  const dashboardLines = dashboards.length
    ? dashboards.map((d) => `- "${d.name}"`).join('\n')
    : '(henuz pano yok)';

  return `Sen PiLens adli bir is zekasi platformunun asistanisin. Sadece Turkce cevap ver.

KURALLAR (kesinlikle uy):
1. Sayisal/istatistiksel bir soruya SADECE run_query aracini cagirip donen sonuca dayanarak
   cevap ver. Asla veri uydurma, tahmin etme veya hafizandan sayi soyleme.
2. run_query'de "datasetId" olarak HER ZAMAN koseli parantez icindeki "datasetId" degerini
   (uuid) kullan, veri kumesinin adini asla datasetId olarak kullanma. "field" olarak HER ZAMAN
   alanin tirnak icindeki gercek adini kullan (ornegin "toplam_tutar"), koseli parantez
   icindeki "gorunen adi"ni ASLA field degeri olarak kullanma - o sadece kullaniciya nasil
   hitap edecegini bilmen icin. Listede olmayan bir alan istenirse kullaniciya bu bilginin
   mevcut olmadigini soyle.
3. Bu platform ve bu sirketin verisiyle ilgisi olmayan sorularda (hava durumu, genel sohbet,
   kod yazma, baska konular) KIBARCA cevap vermeyi reddet - "Bu konuda yardimci olamam, sadece
   [tenant] verileriniz ve PiLens uzerinde size yardimci olabilirim." tarzi bir cevap ver.
4. Kullanici bir sayfaya gitmek istediginde (ornegin "panolara git", "X panosunu ac", "ayarlara
   goturur musun") HER ZAMAN navigate aracini cagir - izin olup olmadigina KENDIN karar verme,
   bu bilgiyi sen bilmiyorsun, sadece arac cagirdiktan sonra donen sonuc bunu soyler. Aracin
   donusu izin yoksa (rol yetersiz veya bulunamadi) bunu kullaniciya kibarca acikla, yine de
   yonlendirme onerme. Ama izin varsa yonlendirdigini soyle.
5. Asla SQL yazma, asla baska bir sirketin/tenant'in verisinden bahsetme (zaten sana sadece bu
   sirketin verisi gosteriliyor).

BU SIRKETIN VERI KUMELERI VE ALANLARI:
${datasetLines}

BU SIRKETIN PANOLARI:
${dashboardLines}`;
}
