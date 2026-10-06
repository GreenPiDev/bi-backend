import { Prisma } from '@prisma/client';
import type { TenantPrismaClient } from '../prisma/tenant-prisma.token';
import { TenantContext } from '../tenant/tenant-context';

/**
 * Bu projenin Postgres kurulumu LC_CTYPE=C ile calisiyor, bu yuzden Postgres'in
 * lower()/ILIKE'i Turkce aksanli karakterleri (Ü, Ö, Ş, Ç, Ğ, İ, ı) casefold edemiyor
 * (orn. lower('MÜHENDİSLİK') -> 'mÜhendİslİk' - Ü/İ degismiyor), bu da Prisma'nin
 * `contains`/`mode: 'insensitive'` ile yaptigi tum arama kutularini Turkce karakter
 * iceren sorgularda bozuyor (bkz. docs/VARSAYIMLAR.md). unaccent() aksanlari ASCII'ye
 * indirip (Ü->U, İ->I) sorunu cozuyor - ASCII harflerin case-fold'u locale'den bagimsiz
 * her zaman calisir. Yan etki: arama artik aksan-duyarsiz da olur (orn. "muhendis"
 * yazinca "Mühendislik" de bulunur) - bu bilincli ve istenen bir davranis.
 *
 * SIRA ONEMLI: `lower(unaccent(x))`, `unaccent(lower(x))` DEGIL. lower() once calisirsa
 * "C" locale'i Ş/İ gibi non-ASCII karakterleri degistirmeden birakir (orn.
 * lower('ŞİRKETİ') -> 'Şİrketİ'), sonra unaccent bu yarim-lowered metni beklenmedik
 * sekilde cozer (orn. 'Şİrketİ' -> 'SIrketI', hala buyuk harfli S/I ile) - "sirketi"
 * aramasi boylece eslesmiyordu (bkz. kullanici bulgusu, docs/VARSAYIMLAR.md V61 duzeltmesi).
 * unaccent once calisirsa sonuc tamamen ASCII'ye iner (orn. 'ŞİRKETİ' -> 'SIRKETI'),
 * ardindan ASCII lower() guvenle 'sirketi' uretir.
 *
 * Bu dosyadaki fonksiyonlar `modules/query` disinda ham SQL kullanimi icin CLAUDE.md
 * §13/§16'ya kasitli, kullanici onayli bir istisnadir (bkz. docs/VARSAYIMLAR.md) -
 * tek amaclari serbest metin aramalarindaki bu locale sorununu cozmek. Tablo/kolon
 * adlari HER ZAMAN cagiran servis tarafindan sabit (hardcoded) string'lerdir; `q`
 * (kullanici girdisi) SADECE parametreli deger olarak SQL'e girer, asla string
 * birlestirmeyle degil.
 */

/** Bir kolon/tablo adini guvenli sekilde quote edilmis SQL identifier'a cevirir. */
export function identifier(name: string): Prisma.Sql {
  return Prisma.raw(`"${name}"`);
}

/** JOIN'li sorgularda tablo takma adiyla nitelenmis kolon (orn. `a."name"`) uretir. */
export function qualifiedColumn(alias: string, column: string): Prisma.Sql {
  return Prisma.raw(`${alias}."${column}"`);
}

/** `lower(unaccent(<kolon>)) LIKE lower(unaccent('%q%'))` kosulu uretir. */
export function turkishContains(columnSql: Prisma.Sql, q: string): Prisma.Sql {
  return Prisma.sql`lower(unaccent(${columnSql})) LIKE lower(unaccent(${`%${q}%`}))`;
}

/** Verilen Prisma.sql sorgusunu calistirip sadece eslesen `id` listesini dondurur -
 * cagiran servis bunu normal (tenant-scoped extension'li) Prisma sorgusuna
 * `where: { id: { in: [...] } }` olarak gecirir; boylece tenant izolasyonu/soft-delete
 * son sorguda extension tarafindan yine de garanti edilir (defense in depth). */
async function findIds(
  prisma: TenantPrismaClient,
  sql: Prisma.Sql,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(sql);
  return rows.map((row) => row.id);
}

/** Tek tablo, iliski/join olmadan, verilen kolonlardan en az birinde `q` gecen
 * satirlarin id'lerini dondurur. */
export async function findIdsByTurkishSearch(
  prisma: TenantPrismaClient,
  table: string,
  columns: string[],
  q: string,
  options: { softDelete?: boolean } = {},
): Promise<string[]> {
  const { tenantId } = TenantContext.getOrThrow();
  const combined = columns
    .map((col) => turkishContains(identifier(col), q))
    .reduce((acc, cond) => Prisma.sql`${acc} OR ${cond}`);
  const sql = Prisma.sql`
    SELECT "id" FROM ${identifier(table)}
    WHERE "tenantId" = ${tenantId}
      ${options.softDelete ? Prisma.sql`AND "deletedAt" IS NULL` : Prisma.empty}
      AND (${combined})
  `;
  return findIds(prisma, sql);
}

/** Join/iliski gerektiren daha karmasik aramalar icin - cagiran servis tam SQL'i
 * kendisi kurar (bkz. turkishContains/identifier), bu fonksiyon sadece calistirip
 * id listesine cevirir. */
export async function findIdsBySql(
  prisma: TenantPrismaClient,
  sql: Prisma.Sql,
): Promise<string[]> {
  return findIds(prisma, sql);
}
