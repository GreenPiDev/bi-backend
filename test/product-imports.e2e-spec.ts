import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

/**
 * Faz B (bkz. docs/VARSAYIMLAR.md V40): farkli marka urun listelerinin heterojen
 * Excel/CSV dosyalarindan ice aktarilmasi. Fixture'lar bilerek CSV olarak kuruldu -
 * exceljs'in kendi Workbook (yazici) + WorkbookReader (okuyucu) ciftini ayni process
 * icinde birden fazla kez kullanmak, sadece exceljs'in kendi urettigi minimal test
 * dosyalarinda bir kutuphane hatasina yol aciyor (gercek Excel dosyalarinda sorun yok,
 * elle dogrulandi) - CSV bu riski tasimiyor ve ayni parse mantigini kullaniyor.
 */
describe('Product Imports (e2e, Faz B)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const password = 'sifre1234';

  let tenantIdA: string;
  let tenantIdB: string;
  let cookiesA: string[];
  let cookiesB: string[];
  let productListIdA: string;
  let productListIdB: string;

  // Schneider'in gercek dosyasindaki desen: 2 baslik-oncesi satir, baslik satir 3'te.
  const schneiderLikeCsv = Buffer.from(
    'SCHNEIDER ELECTRIC\n15 Aralik 2025\nReferans,Aciklama,Seri,Fiyat,Para Birimi\n' +
      'A9MEM3110,iEM3110 63A kWH olcer,kWH olcerler,253,EUR\n' +
      'A9MEM3115,iEM3115 63A kWH olcer,kWH olcerler,259,EUR\n' +
      'A9INVALID,,kWH olcerler,100,EUR\n',
    'utf-8',
  );

  // ABB'nin gercek dosyasi gibi: baslik satir 1'de, 4 kolon, TR ondalik formati.
  const abbLikeCsv = Buffer.from(
    'Urun Kodu,Urun Adi,Fiyat,Para Birimi\n' +
      '1019701,Kontaktor A,"65.056,00",TRY\n',
    'utf-8',
  );

  const htmlAsXls = Buffer.from(
    '<table border="1"><tr><th>Urun Kodu</th></tr><tr><td>123</td></tr></table>',
    'utf-8',
  );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const registerA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Tenant A',
        name: 'Owner A',
        email: ownerEmailA,
        password,
      });
    tenantIdA = registerA.body.user.tenantId as string;
    cookiesA = registerA.headers['set-cookie'] as unknown as string[];

    const registerB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Tenant B',
        name: 'Owner B',
        email: ownerEmailB,
        password,
      });
    tenantIdB = registerB.body.user.tenantId as string;
    cookiesB = registerB.headers['set-cookie'] as unknown as string[];

    await prisma.tenantModule.create({
      data: { tenantId: tenantIdA, moduleKey: 'crm' },
    });
    // Tenant B'de 'crm' bilerek acilmadi - hem 403 MODULE_NOT_ENABLED testi hem de
    // ProductList'in yalnizca prisma ile (modul kapisindan gecmeden) fixture olarak
    // kurulabilecegini dogrulamak icin.
    const productListA = await prisma.productList.create({
      data: { tenantId: tenantIdA, name: 'Schneider Electric' },
    });
    productListIdA = productListA.id;
    const productListB = await prisma.productList.create({
      data: { tenantId: tenantIdB, name: 'B Tenant Listesi' },
    });
    productListIdB = productListB.id;
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('POST /product-imports/preview headerRowIndex verilmezse ham satirlari doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/product-imports/preview')
      .set('Cookie', cookiesA)
      .attach('file', schneiderLikeCsv, 'schneider.csv');
    expect(res.status).toBe(201);
    expect(res.body.rows[0]).toEqual(['SCHNEIDER ELECTRIC']);
    expect(res.body.rows[2]).toEqual([
      'Referans',
      'Aciklama',
      'Seri',
      'Fiyat',
      'Para Birimi',
    ]);
  });

  it('POST /product-imports/preview headerRowIndex=2 ile eslesme onizlemesi doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/product-imports/preview')
      .set('Cookie', cookiesA)
      .field('headerRowIndex', '2')
      .attach('file', schneiderLikeCsv, 'schneider.csv');
    expect(res.status).toBe(201);
    expect(res.body.headers).toEqual([
      'Referans',
      'Aciklama',
      'Seri',
      'Fiyat',
      'Para Birimi',
    ]);
    expect(res.body.totalRows).toBe(3);
  });

  it('POST /product-imports/preview gercek olmayan (.xls uzantili HTML) dosyayi reddeder', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/product-imports/preview')
      .set('Cookie', cookiesA)
      .attach('file', htmlAsXls, 'abb.xls');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it("POST /product-imports/:productListId 'mapping' alaninda name eksikse MAPPING_INCOMPLETE doner", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/product-imports/${productListIdA}`)
      .set('Cookie', cookiesA)
      .field('headerRowIndex', '2')
      .field('mapping', JSON.stringify({ sku: 'Referans' }))
      .attach('file', schneiderLikeCsv, 'schneider.csv');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MAPPING_INCOMPLETE');
  });

  it('POST /product-imports/:productListId gecerli satirlari aktarir, "Seri" attributes\'a duser, hatali satiri raporlar', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/product-imports/${productListIdA}`)
      .set('Cookie', cookiesA)
      .field('headerRowIndex', '2')
      .field('numberFormat', 'en')
      .field(
        'mapping',
        JSON.stringify({
          name: 'Aciklama',
          sku: 'Referans',
          price: 'Fiyat',
          currency: 'Para Birimi',
        }),
      )
      .field('attributeColumns', JSON.stringify(['Seri']))
      .attach('file', schneiderLikeCsv, 'schneider.csv');
    expect(res.status).toBe(201);
    expect(res.body.totalRows).toBe(3);
    expect(res.body.imported).toBe(2);
    expect(res.body.errors).toHaveLength(1);
    // headerRowIndex=2 (0-based) -> dosyada satir 3 baslik, ilk veri satiri 4;
    // hatali (bos ad) satir ucuncu veri satiri = dosya satiri 6.
    expect(res.body.errors[0].row).toBe(6);

    const products = await prisma.product.findMany({
      where: { productListId: productListIdA },
      orderBy: { sku: 'asc' },
    });
    expect(products).toHaveLength(2);
    expect(products[0].sku).toBe('A9MEM3110');
    expect(Number(products[0].price)).toBe(253);
    expect(products[0].currency).toBe('EUR');
    expect(products[0].attributes).toEqual({ Seri: 'kWH olcerler' });
  });

  it('POST /product-imports/:productListId TR sayi formatini dogru ayristirir', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/product-imports/${productListIdA}`)
      .set('Cookie', cookiesA)
      .field('headerRowIndex', '0')
      .field('numberFormat', 'tr')
      .field(
        'mapping',
        JSON.stringify({
          name: 'Urun Adi',
          sku: 'Urun Kodu',
          price: 'Fiyat',
          currency: 'Para Birimi',
        }),
      )
      .attach('file', abbLikeCsv, 'abb.csv');
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);

    const product = await prisma.product.findFirst({
      where: { productListId: productListIdA, sku: '1019701' },
    });
    expect(Number(product?.price)).toBe(65056);
  });

  it("POST /product-imports/:productListId baska kiracinin urun listesi id'siyle 404 doner", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/product-imports/${productListIdB}`)
      .set('Cookie', cookiesA)
      .field('headerRowIndex', '0')
      .field('mapping', JSON.stringify({ name: 'Urun Adi' }))
      .attach('file', abbLikeCsv, 'abb.csv');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it("'crm' modulu kapaliyken (tenant B) POST /product-imports/preview 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/product-imports/preview')
      .set('Cookie', cookiesB)
      .attach('file', abbLikeCsv, 'abb.csv');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ENABLED');
  });
});
