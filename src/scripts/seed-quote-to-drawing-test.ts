/**
 * Tek seferlik, tenant'a ozel yardimci script: "Test Sirketi" kiracisina, Tekliften
 * Otomatik Teknik Cizim akisinin (PDF -> AI satir eslestirme, Faz D6) manuel uctan uca
 * testi icin gerekli veriyi ekler. seed-drawing-test.ts ile ayni calisma deseni, ama
 * kullanici talebiyle ayri/tanimlanabilir isimlendirme kullanir (tekrar calistirilabilir
 * olmasi icin de ayri bir script dosyasi olarak tutuldu, mevcut script'in uzerine
 * yazilmadi).
 *
 * Idempotent DEGIL - tekrar calistirilirsa urun listesi/urunler/teklif TEKRAR olusturulur.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RealtimeService } from '../core/realtime/realtime.service';
import { TenantContext } from '../core/tenant/tenant-context';
import { AccountsService } from '../modules/accounts/accounts.service';
import { ProductListsService } from '../modules/product-lists/product-lists.service';
import { ProductsService } from '../modules/products/products.service';
import { QuotesService } from '../modules/quotes/quotes.service';

const TENANT_ID = 'e5422fa3-db30-4d0d-a8a0-0bf90b30d648'; // Test Sirketi
const ADMIN_USER_ID = 'a74addec-3be0-4f1e-8411-f13e8c13ea99'; // companyadmin@test.com

const PRODUCT_LIST_NAME = 'Tekliften Çizime Test Örnek Ürün Listesi';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const realtime = app.get(RealtimeService);
    realtime.emitToTenant = () => undefined;
    realtime.emitToAll = () => undefined;

    const accounts = app.get(AccountsService);
    const productLists = app.get(ProductListsService);
    const products = app.get(ProductsService);
    const quotes = app.get(QuotesService);

    await TenantContext.run(
      { tenantId: TENANT_ID, userId: ADMIN_USER_ID, roleIds: [] },
      async () => {
        console.log('Firma oluşturuluyor...');
        const account = await accounts.create(ADMIN_USER_ID, {
          name: 'Tekliften Çizime Test Firması',
          accountTypes: ['CUSTOMER'],
          city: 'İstanbul',
          phone: '+90 532 000 00 00',
        });

        console.log('Ürün listesi oluşturuluyor...');
        const list = await productLists.create({
          name: PRODUCT_LIST_NAME,
        });

        // bandKey degerleri built-in "AG Pano - Standart Arka Plaka" sablonunun
        // bantlariyla (busbar/main-breaker/outgoing/terminal) eslesir. libraryComponentKey
        // degerleri built-in kutuphanedeki (drawing-library-provisioning.service.ts) key'lerle
        // birebir ayni.
        const productDefs = [
          {
            name: 'Kompakt Şalter 160A (Test)',
            sku: 'TEST-SAL-160A',
            unit: 'adet',
            price: 3200,
            category: 'Şalter',
            drawingSpec: {
              widthMm: 150,
              heightMm: 200,
              libraryComponentKey: 'switch-compact',
              bandKey: 'main-breaker',
              bandOrder: 0,
            },
          },
          {
            name: 'Kontaktör 40A (Test)',
            sku: 'TEST-KNT-40A',
            unit: 'adet',
            price: 780,
            category: 'Kontaktör',
            drawingSpec: {
              widthMm: 100,
              heightMm: 120,
              libraryComponentKey: 'contactor',
              bandKey: 'outgoing',
              bandOrder: 0,
            },
          },
          {
            name: 'Koruma Rölesi (Test)',
            sku: 'TEST-ROL-01',
            unit: 'adet',
            price: 320,
            category: 'Röle',
            drawingSpec: {
              widthMm: 50,
              heightMm: 80,
              libraryComponentKey: 'relay',
              bandKey: 'outgoing',
              bandOrder: 1,
            },
          },
          {
            name: 'Akım Trafosu 100/5A (Test)',
            sku: 'TEST-CT-100-5',
            unit: 'adet',
            price: 410,
            category: 'Akım Trafosu',
            drawingSpec: {
              widthMm: 80,
              heightMm: 80,
              libraryComponentKey: 'current-transformer',
              bandKey: 'outgoing',
              bandOrder: 2,
            },
          },
          {
            name: 'Kompanzasyon Kondansatörü 25kVAr (Test)',
            sku: 'TEST-KAP-25',
            unit: 'adet',
            price: 1950,
            category: 'Kondansatör',
            drawingSpec: {
              widthMm: 100,
              heightMm: 250,
              libraryComponentKey: 'capacitor',
              bandKey: 'outgoing',
              bandOrder: 3,
            },
          },
          {
            name: 'Klemens Seti 16mm² (Test)',
            sku: 'TEST-KLM-16',
            unit: 'adet',
            price: 210,
            category: 'Klemens',
            drawingSpec: {
              widthMm: 300,
              heightMm: 60,
              libraryComponentKey: 'terminal-block',
              bandKey: 'terminal',
              bandOrder: 0,
            },
          },
          {
            name: 'Kablo Kanalı 60x100 (Test)',
            sku: 'TEST-KK-60100',
            unit: 'metre',
            price: 95,
            category: 'Kablo Kanalı',
            drawingSpec: {
              widthMm: 60,
              heightMm: 100,
              libraryComponentKey: 'cable-duct',
              bandKey: 'terminal',
              bandOrder: 1,
            },
          },
        ] as const;

        console.log('Çizilebilir ürünler oluşturuluyor...');
        const createdProducts = [];
        for (const def of productDefs) {
          const product = await products.create({
            productListId: list.id,
            name: def.name,
            sku: def.sku,
            unit: def.unit,
            price: def.price,
            currency: 'TRY',
            category: def.category,
            drawingSpec: def.drawingSpec,
          });
          createdProducts.push(product);
        }
        const [salter, kontaktor, role, ct, kapasitor, klemens, kabloKanali] =
          createdProducts;

        console.log('Teklif oluşturuluyor...');
        const quote = await quotes.create(ADMIN_USER_ID, {
          senderId: ADMIN_USER_ID,
          accountId: account.id,
          items: [
            { productId: salter!.id, quantity: 1, discountPct: 0, vatPct: 20 },
            {
              productId: kontaktor!.id,
              quantity: 3,
              discountPct: 0,
              vatPct: 20,
            },
            { productId: role!.id, quantity: 3, discountPct: 0, vatPct: 20 },
            { productId: ct!.id, quantity: 3, discountPct: 0, vatPct: 20 },
            {
              productId: kapasitor!.id,
              quantity: 1,
              discountPct: 0,
              vatPct: 20,
            },
            { productId: klemens!.id, quantity: 1, discountPct: 0, vatPct: 20 },
            {
              productId: kabloKanali!.id,
              quantity: 2,
              discountPct: 0,
              vatPct: 20,
            },
          ],
          quoteDate: new Date(),
          quoteCurrency: 'TRY' as const,
          leadTime: '5 iş günü',
          title: 'Tekliften Çizime Test - AG Pano',
        });

        console.log('\nTamamlandı:');
        console.log(`  Firma: ${account.name} (${account.id})`);
        console.log(`  Ürün listesi: ${list.name} (${list.id})`);
        console.log(`  Teklif: ${quote.quoteNumber} (${quote.id})`);
        console.log(`\nSıradaki adımlar:`);
        console.log(`  1. /teklifler/${quote.id} sayfasını aç, PDF'i indir.`);
        console.log(
          `  2. /cizimler/pdf-ice-aktar sayfasında bu teklifi seçip PDF'i yükle.`,
        );
      },
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
