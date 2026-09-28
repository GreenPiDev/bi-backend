/**
 * Firma adlari her zaman TR locale'e gore buyuk harfe cevrilip saklanir (orn.
 * "Abc Sirketi" -> "ABC ŞİRKETİ") - farkli musteri dosyalarindan gelen firma
 * adlarinin tutarli/aranabilir olmasi icin kullanici karari. `toLocaleUpperCase('tr-TR')`
 * kullanilir, JS'in varsayilan `toUpperCase()`'i degil - "i" harfini yanlis ("I" yerine
 * "İ" olmasi gerekirken) buyutur.
 *
 * Bu fonksiyon, Account.name'i yazan/eslesen HER kod yolunda (firma ice aktarma,
 * gorusme ice aktarma, gorusme formundan otomatik firma olusturma) cagrilmalidir -
 * aksi halde ayni firma, ustteki normalizasyonu atlayan bir yoldan farkli case ile
 * ikinci kez olusturulup duplike kayit ortaya cikar. Postgres'in varsayilan "C"
 * locale'i Turkce aksanli harflerde (İ/ı, Ş/ş, Ğ/ğ, Ü/ü, Ö/ö, Ç/ç) `mode: 'insensitive'`
 * (ILIKE) karsilastirmasini yanlis sonuclandirdigi icin, eslesme de DB'ye degil bu
 * normalizasyona guvenilerek exact-match ile yapilmalidir.
 */
export function normalizeAccountName(name: string): string {
  return name.trim().toLocaleUpperCase('tr-TR');
}
