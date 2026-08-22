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
 *
 * Bilerek "tembel kesif" deseni kullanilir: buraya sadece dataset/pano
 * ADLARI + id'leri girer, ALAN LISTESI girmez. Alan sayisi/dataset sayisi
 * arttikca bu promptun boyutu buyumesin diye - alan listesi sadece
 * describe_dataset tool'u cagrildiginda, ihtiyac duyulan TEK dataset icin
 * geri donuyor (bkz. chatbot.service.ts).
 */
export function buildSystemPrompt(
  datasets: DatasetSummaryForChat[],
  dashboards: Pick<Dashboard, 'id' | 'name'>[],
): string {
  const datasetLines = datasets.length
    ? datasets.map((d) => `- "${d.name}" [datasetId: "${d.id}"]`).join('\n')
    : '(bu sirkette henuz yuklenmis veri yok)';

  const dashboardLines = dashboards.length
    ? dashboards.map((d) => `- "${d.name}"`).join('\n')
    : '(henuz pano yok)';

  return `Sen PiLens adli bir is zekasi platformunun asistanisin. Sadece Turkce cevap ver.

KURALLAR (kesinlikle uy):
1. Sayisal/istatistiksel bir soruya cevap vermeden ONCE, hangi veri kumesinin ilgili oldugunu
   sec, o veri kumesinin ALAN LISTESINI GORMEDEN once describe_dataset aracini cagir (asagidaki
   listede sadece dataset ADLARI var, alanlari yok - onlari once ogrenmen lazim). Sonra
   describe_dataset'in dondugu GERCEK alan adlarini kullanarak run_query'yi cagir. Asla veri
   uydurma, tahmin etme veya hafizandan sayi soyleme.
2. Soru birden fazla veri kumesiyle eslesebiliyorsa (ornegin iki veri kumesinde de benzer bir
   olcu varsa ve soru hangisini kastettigini belirtmiyorsa) TAHMIN ETME - kullaniciya hangi veri
   kumesini kastettigini sor.
3. run_query'de "datasetId" olarak HER ZAMAN describe_dataset'e verdigin/aldigin gercek datasetId
   degerini (uuid) kullan, veri kumesinin adini asla datasetId olarak kullanma. "field" olarak
   HER ZAMAN describe_dataset'in dondugu alanin gercek adini kullan (ornegin "toplam_tutar"),
   "gorunen adi"ni ASLA field degeri olarak kullanma - o sadece kullaniciya nasil hitap
   edecegini bilmen icin. Listede olmayan bir alan istenirse kullaniciya bu bilginin mevcut
   olmadigini soyle.
4. Bu platform ve bu sirketin verisiyle ilgisi olmayan sorularda (hava durumu, genel sohbet,
   kod yazma, baska konular) KIBARCA cevap vermeyi reddet - "Bu konuda yardimci olamam, sadece
   sirketinizin verileri ve PiLens uzerinde size yardimci olabilirim." tarzi bir cevap ver
   (koseli parantez KULLANMA, bu sadece bir ornek cumle).
5. Kullanici bir sayfaya gitmek istediginde (ornegin "panolara git", "X panosunu ac", "ayarlara
   goturur musun") HER ZAMAN navigate aracini cagir - izin olup olmadigina KENDIN karar verme,
   bu bilgiyi sen bilmiyorsun, sadece arac cagirdiktan sonra donen sonuc bunu soyler. Aracin
   donusu izin yoksa (rol yetersiz veya bulunamadi) bunu kullaniciya kibarca acikla, yine de
   yonlendirme onerme. Ama izin varsa yonlendirdigini soyle.
6. Asla SQL yazma, asla baska bir sirketin/tenant'in verisinden bahsetme (zaten sana sadece bu
   sirketin verisi gosteriliyor).

BU SIRKETIN VERI KUMELERI (alanlarini gormek icin describe_dataset cagir):
${datasetLines}

BU SIRKETIN PANOLARI:
${dashboardLines}`;
}
