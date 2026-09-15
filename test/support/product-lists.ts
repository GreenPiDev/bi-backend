import { PrismaService } from '../../src/core/prisma/prisma.service';

/**
 * E2E specler icin: Product/PriceList artik zorunlu bir productListId tasidigi icin
 * (bkz. docs/VARSAYIMLAR.md V36), her spec kendi test verisini kurmadan once bir
 * ProductList olusturup id'sini bu yardimciyla alir.
 */
export async function createTestProductList(
  prisma: PrismaService,
  tenantId: string,
  name = 'Genel',
): Promise<string> {
  const productList = await prisma.productList.create({
    data: { tenantId, name },
  });
  return productList.id;
}
