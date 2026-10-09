/**
 * Tek seferlik prod script: "Demo Sirket" kiracisina (seed-ahmet-demo.ts'in olusturdugu
 * verinin ustune) yarinki sunum icin ek, birbiriyle baglantili veri ekler - ozellikle
 * seed-ahmet-demo.ts'in kapsamadigi sayfalar (Dashboard/Panolar, Urun Kategorileri,
 * Teklif Sablonlari, Secenek listeleri (unvan/departman/marka/odeme yontemi/iban/birim/
 * hatirlatma turu), Takvim Paylasimi, Cizimler, Memnuniyet Anketi) ve mevcut ana
 * tablolari (cari/kisi/gorusme/firsat/teklif/proje/siparis/mesaj/takvim) coklar.
 *
 * Idempotent DEGIL - tekrar calistirilmadan once "Marka Bazli Ek Cari (Sunum)" adinda
 * bir cari olup olmadigi kontrol edilir, varsa erken cikilir.
 */
import { NestFactory } from '@nestjs/core';
import { DatasetSourceKind } from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../core/prisma/prisma.service';
import { TenantContext } from '../core/tenant/tenant-context';
import { RealtimeService } from '../core/realtime/realtime.service';
import { AccountsService } from '../modules/accounts/accounts.service';
import { ContactsService } from '../modules/contacts/contacts.service';
import { CalendarEventsService } from '../modules/calendar-events/calendar-events.service';
import { CalendarSharesService } from '../modules/calendar-shares/calendar-shares.service';
import { InteractionsService } from '../modules/interactions/interactions.service';
import { OpportunitiesService } from '../modules/opportunities/opportunities.service';
import { ProductListsService } from '../modules/product-lists/product-lists.service';
import { ProductsService } from '../modules/products/products.service';
import { StockItemsService } from '../modules/stock-items/stock-items.service';
import { QuotesService } from '../modules/quotes/quotes.service';
import { ProjectsService } from '../modules/projects/projects.service';
import { PurchaseOrdersService } from '../modules/purchase-orders/purchase-orders.service';
import { MessagesService } from '../modules/messages/messages.service';
import { ProductCategoriesService } from '../modules/product-categories/product-categories.service';
import { QuoteTemplatesService } from '../modules/quote-templates/quote-templates.service';
import { PostSaleCasesService } from '../modules/post-sale-cases/post-sale-cases.service';
import { TitleOptionsService } from '../modules/title-options/title-options.service';
import { DepartmentOptionsService } from '../modules/department-options/department-options.service';
import { BrandOptionsService } from '../modules/brand-options/brand-options.service';
import { PaymentMethodOptionsService } from '../modules/payment-method-options/payment-method-options.service';
import { IbanOptionsService } from '../modules/iban-options/iban-options.service';
import { UnitOptionsService } from '../modules/unit-options/unit-options.service';
import { ReminderTypeOptionsService } from '../modules/reminder-type-options/reminder-type-options.service';
import { DashboardsService } from '../modules/dashboards/dashboards.service';
import { WidgetsService } from '../modules/widgets/widgets.service';
import { DrawingsService } from '../modules/drawings/drawings.service';

const TENANT_ID = 'b05e7e46-3168-4ba7-8f44-17efd077207b';
const ADMIN_USER_ID = 'cafa8c66-47cf-4689-be9d-213016d00e4c';
const SECOND_USER_EMAIL = 'elif.demir@demosirket.com';
const GUARD_ACCOUNT_NAME = 'Marmara Pano Teknoloji ve Elektrik San. Tic. A.S.';

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);

    const realtime = app.get(RealtimeService);
    realtime.emitToTenant = () => undefined;
    realtime.emitToAll = () => undefined;

    const guardExisting = await prisma.account.findFirst({
      where: { tenantId: TENANT_ID, name: GUARD_ACCOUNT_NAME },
    });
    if (guardExisting) {
      console.log('Bu script zaten calistirilmis - cikiliyor.');
      return;
    }

    const secondUser = await prisma.user.findUnique({
      where: { email: SECOND_USER_EMAIL },
    });
    if (!secondUser) {
      throw new Error('Ikinci demo kullanici (Elif Demir) bulunamadi.');
    }

    const accounts = app.get(AccountsService);
    const contacts = app.get(ContactsService);
    const calendarEvents = app.get(CalendarEventsService);
    const calendarShares = app.get(CalendarSharesService);
    const interactions = app.get(InteractionsService);
    const opportunities = app.get(OpportunitiesService);
    const productLists = app.get(ProductListsService);
    const products = app.get(ProductsService);
    const stockItems = app.get(StockItemsService);
    const quotes = app.get(QuotesService);
    const projects = app.get(ProjectsService);
    const purchaseOrders = app.get(PurchaseOrdersService);
    const messages = app.get(MessagesService);
    const productCategories = app.get(ProductCategoriesService);
    const quoteTemplates = app.get(QuoteTemplatesService);
    const postSaleCases = app.get(PostSaleCasesService);
    const titleOptions = app.get(TitleOptionsService);
    const departmentOptions = app.get(DepartmentOptionsService);
    const brandOptions = app.get(BrandOptionsService);
    const paymentMethodOptions = app.get(PaymentMethodOptionsService);
    const ibanOptions = app.get(IbanOptionsService);
    const unitOptions = app.get(UnitOptionsService);
    const reminderTypeOptions = app.get(ReminderTypeOptionsService);
    const dashboards = app.get(DashboardsService);
    const widgets = app.get(WidgetsService);
    const drawings = app.get(DrawingsService);

    await TenantContext.run(
      { tenantId: TENANT_ID, userId: ADMIN_USER_ID, roleIds: [] },
      async () => {
        console.log(
          'Secenek listeleri dolduruluyor (unvan/departman/marka/odeme/iban/birim/hatirlatma)...',
        );
        for (const label of [
          'Genel Mudur',
          'Satin Alma Muduru',
          'Proje Muhendisi',
          'Saha Sefi',
          'Muhasebe Sorumlusu',
          'Ihracat Sorumlusu',
          'Yatirimlar Direktoru',
        ]) {
          await titleOptions.create({ label });
        }
        for (const label of [
          'Satis',
          'Satin Alma',
          'Muhendislik',
          'Muhasebe',
          'Yonetim',
        ]) {
          await departmentOptions.create({ label });
        }
        for (const label of [
          'Schneider Electric',
          'ABB',
          'Siemens',
          'Legrand',
          'Lider Pano',
        ]) {
          await brandOptions.create({ label });
        }
        for (const label of ['Havale/EFT', 'Kredi Karti', 'Cek', 'Nakit']) {
          await paymentMethodOptions.create({ label });
        }
        for (const label of ['adet', 'metre', 'set', 'kg', 'kutu']) {
          await unitOptions.create({ label });
        }
        for (const label of ['E-posta', 'Telefon', 'SMS']) {
          await reminderTypeOptions.create({ label });
        }
        await ibanOptions.create({
          bankName: 'Türkiye İş Bankası',
          accountHolderName: 'Demo Şirket Ltd. Şti.',
          accountNumber: '1234567',
          iban: 'TR330006100519786457841326',
        });
        await ibanOptions.create({
          bankName: 'Garanti BBVA',
          accountHolderName: 'Demo Şirket Ltd. Şti.',
          iban: 'TR120006200051600006299024',
        });

        console.log('Urun kategorileri dolduruluyor...');
        for (const label of [
          'Pano',
          'Bara',
          'Salter',
          'Kontaktor',
          'Role',
          'Sigorta',
          'Kablo Kanali',
          'Topraklama',
          'Otomasyon',
          'Olcum',
          'Klemens',
        ]) {
          await productCategories.create({ label });
        }

        console.log('Teklif sablonlari olusturuluyor...');
        await quoteTemplates.create(ADMIN_USER_ID, {
          name: 'Standart Teklif Sablonu',
          isDefault: true,
          companyDisplayName: 'Demo Şirket Ltd. Şti.',
          companyTagline: 'Elektrik Pano ve Otomasyon Cozumleri',
        });
        await quoteTemplates.create(ADMIN_USER_ID, {
          name: 'Kurumsal Teklif Sablonu',
          companyDisplayName: 'Demo Şirket Ltd. Şti.',
          companyTagline: 'Guvenilir Enerji Cozum Ortaginiz',
        });

        console.log('Ek cariler olusturuluyor...');
        const acc9 = await accounts.create(ADMIN_USER_ID, {
          name: GUARD_ACCOUNT_NAME,
          taxNumber: '9234567897',
          taxOffice: 'Tuzla V.D.',
          sector: ['Elektrik Panosu'],
          accountTypes: ['CUSTOMER'],
          phone: '+90 538 777 88 99',
          email: 'info@marmarapano.example.com',
          address: 'Tuzla Organize Sanayi No:12',
          city: 'Istanbul',
          district: 'Tuzla',
        });
        const acc10 = await accounts.create(ADMIN_USER_ID, {
          name: 'Ege Enerji Sistemleri A.S.',
          taxNumber: '9334567898',
          taxOffice: 'Bornova V.D.',
          sector: ['Enerji'],
          accountTypes: ['CUSTOMER', 'SUPPLIER'],
          phone: '+90 539 888 99 00',
          email: 'satis@egeenerji.example.com',
          address: 'Kemalpasa Sanayi Sitesi No:5',
          city: 'Izmir',
          district: 'Kemalpasa',
        });
        const acc11 = await accounts.create(ADMIN_USER_ID, {
          name: 'Karadeniz Taahhut Elektrik Ltd. Sti.',
          taxNumber: '9434567899',
          taxOffice: 'Ortahisar V.D.',
          sector: ['Taahhut'],
          accountTypes: ['CONTRACTOR'],
          phone: '+90 530 999 00 11',
          email: 'info@karadeniztaahhut.example.com',
          address: 'Degirmendere Sanayi Sitesi No:3',
          city: 'Trabzon',
          district: 'Ortahisar',
        });
        const acc12 = await accounts.create(ADMIN_USER_ID, {
          name: 'Anadolu Pano Imalat Sanayi Ticaret A.S.',
          taxNumber: '9534567800',
          taxOffice: 'Kayseri V.D.',
          sector: ['Imalat'],
          accountTypes: ['SUPPLIER'],
          phone: '+90 531 000 11 22',
          email: 'tedarik@anadolupano.example.com',
          address: 'Anadolu OSB No:18',
          city: 'Kayseri',
          district: 'Melikgazi',
        });
        const acc13 = await accounts.create(ADMIN_USER_ID, {
          name: 'Boru Hatti Enerji Yatirim A.S.',
          taxNumber: '9634567801',
          taxOffice: 'Cayirova V.D.',
          sector: ['Enerji'],
          accountTypes: ['CUSTOMER'],
          phone: '+90 532 111 00 22',
          email: 'iletisim@boruhattienerji.example.com',
          address: 'Dilovasi Sanayi Bolgesi No:44',
          city: 'Kocaeli',
          district: 'Dilovasi',
        });

        console.log('Ek kisiler olusturuluyor...');
        const contact9 = await contacts.create(ADMIN_USER_ID, {
          firstName: 'Serkan',
          lastName: 'Demirtas',
          accountId: acc9.id,
          title: 'Satin Alma Muduru',
          phone: '+90 538 777 88 00',
          email: 'serkan.demirtas@marmarapano.example.com',
          status: 'ACTIVE',
          lastContactedAt: daysFromNow(-3),
        });
        const contact10 = await contacts.create(ADMIN_USER_ID, {
          firstName: 'Gulsen',
          lastName: 'Aktas',
          accountId: acc10.id,
          title: 'Genel Mudur',
          phone: '+90 539 888 99 11',
          email: 'gulsen.aktas@egeenerji.example.com',
          status: 'ACTIVE',
          lastContactedAt: daysFromNow(-7),
        });
        await contacts.create(ADMIN_USER_ID, {
          firstName: 'Tolga',
          lastName: 'Yavuz',
          accountId: acc10.id,
          title: 'Proje Muhendisi',
          status: 'ACTIVE',
          lastContactedAt: daysFromNow(-60),
        });
        const contact11 = await contacts.create(ADMIN_USER_ID, {
          firstName: 'Nazli',
          lastName: 'Korkmaz',
          accountId: acc11.id,
          title: 'Saha Sefi',
          phone: '+90 530 999 00 22',
          status: 'ACTIVE',
          lastContactedAt: daysFromNow(-12),
        });
        const contact12 = await contacts.create(ADMIN_USER_ID, {
          firstName: 'Volkan',
          lastName: 'Erdem',
          accountId: acc12.id,
          title: 'Ihracat Sorumlusu',
          status: 'ACTIVE',
          lastContactedAt: daysFromNow(-220),
        });
        const contact13 = await contacts.create(ADMIN_USER_ID, {
          firstName: 'Merve',
          lastName: 'Sahin',
          accountId: acc13.id,
          title: 'Yatirimlar Direktoru',
          phone: '+90 532 111 00 33',
          email: 'merve.sahin@boruhattienerji.example.com',
          status: 'ACTIVE',
          lastContactedAt: daysFromNow(-1),
        });

        console.log('Mevcut urun/depo kayitlari okunuyor...');
        const existingProducts = await prisma.product.findMany({
          where: { tenantId: TENANT_ID, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        });
        const mainWarehouse = await prisma.warehouse.findFirst({
          where: { tenantId: TENANT_ID },
        });
        if (!mainWarehouse) {
          throw new Error('Depo bulunamadi.');
        }
        const panoGovdesi = existingProducts.find(
          (p) => p.sku === 'PNL-800200060',
        )!;
        const kontaktor = existingProducts.find((p) => p.sku === 'KNT-40A')!;
        const termikRole = existingProducts.find((p) => p.sku === 'TR-1825')!;
        const kabloKanali = existingProducts.find((p) => p.sku === 'KK-10060')!;
        const nhSigorta = existingProducts.find((p) => p.sku === 'NH-3K')!;
        const topraklamaSeti = existingProducts.find(
          (p) => p.sku === 'TBS-01',
        )!;

        console.log('Takvim etkinlikleri olusturuluyor...');
        await calendarEvents.create(TENANT_ID, ADMIN_USER_ID, {
          title: 'Marmara Pano - Yeni Proje Degerlendirmesi',
          startAt: daysFromNow(-4),
          endAt: new Date(daysFromNow(-4).getTime() + 2 * 60 * 60 * 1000),
          attendees: [{ userId: ADMIN_USER_ID }],
        });
        await calendarEvents.create(TENANT_ID, ADMIN_USER_ID, {
          title: 'Ege Enerji - Teknik Toplanti',
          startAt: daysFromNow(3),
          endAt: daysFromNow(3),
          attendees: [
            { userId: ADMIN_USER_ID },
            { userId: secondUser.id, note: 'Teknik sartname hazirlanacak' },
          ],
        });
        await calendarEvents.create(TENANT_ID, ADMIN_USER_ID, {
          title: 'Boru Hatti Enerji - Yatirim Sunumu',
          startAt: daysFromNow(6),
          endAt: daysFromNow(6),
          attendees: [{ userId: secondUser.id }],
        });
        await calendarEvents.create(TENANT_ID, ADMIN_USER_ID, {
          title: 'Karadeniz Taahhut - Saha Ziyareti',
          startAt: daysFromNow(10),
          endAt: daysFromNow(10),
          attendees: [{ userId: ADMIN_USER_ID }],
        });

        console.log('Takvim paylasimi olusturuluyor...');
        await calendarShares.setGrants(TENANT_ID, ADMIN_USER_ID, [
          secondUser.id,
        ]);

        console.log('Gorusmeler ve firsatlar olusturuluyor...');
        await interactions.create(TENANT_ID, ADMIN_USER_ID, {
          accountId: acc9.id,
          contactId: contact9.id,
          type: 'ZİYARET',
          notes:
            'Yeni proje icin pano ihtiyaclari gorusuldu, teknik sartname talep edildi.',
          occurredAt: daysFromNow(-4),
          opportunity: {
            name: 'Marmara Pano - Yeni Proje Panolari',
            stage: 'QUALIFIED',
            estimatedValue: 310000,
          },
        });
        await interactions.create(TENANT_ID, ADMIN_USER_ID, {
          accountId: acc10.id,
          contactId: contact10.id,
          type: 'TOPLANTI',
          notes:
            'Enerji analizoru ve topraklama seti icin fiyat gorusmesi yapildi.',
          occurredAt: daysFromNow(-2),
        });
        await interactions.create(TENANT_ID, ADMIN_USER_ID, {
          accountId: acc11.id,
          contactId: contact11.id,
          type: 'TELEFON',
          notes: 'Taahhut projesi kapsaminda malzeme listesi paylasildi.',
          occurredAt: daysFromNow(-9),
        });
        await interactions.create(TENANT_ID, ADMIN_USER_ID, {
          accountId: acc13.id,
          contactId: contact13.id,
          type: 'E-POSTA',
          notes: 'Yatirim projesi icin on fiyat talebi alindi.',
          occurredAt: daysFromNow(-1),
          opportunity: {
            name: 'Boru Hatti Enerji - Otomasyon Yatirimi',
            stage: 'PROPOSAL',
            estimatedValue: 280000,
          },
        });
        const closedInteraction2 = await interactions.create(
          TENANT_ID,
          ADMIN_USER_ID,
          {
            accountId: acc12.id,
            contactId: contact12.id,
            type: 'ZİYARET',
            notes: 'Tedarik kapasitesi degerlendirmesi tamamlandi.',
            occurredAt: daysFromNow(-25),
          },
        );
        await interactions.update(closedInteraction2.interaction.id, {
          status: 'CLOSED',
        });

        await opportunities.create(TENANT_ID, ADMIN_USER_ID, {
          accountId: acc12.id,
          name: 'Anadolu Pano - Yillik Tedarik Anlasmasi',
          stage: 'PROPOSAL',
          estimatedValue: 390000,
        });
        await opportunities.create(TENANT_ID, ADMIN_USER_ID, {
          accountId: acc11.id,
          name: 'Karadeniz Taahhut - Saha Elektrik Isi',
          stage: 'NEW',
          estimatedValue: 112000,
        });

        console.log('Ek teklifler olusturuluyor...');
        const today = new Date();

        await quotes.create(ADMIN_USER_ID, {
          senderId: ADMIN_USER_ID,
          accountId: acc9.id,
          contactId: contact9.id,
          items: [
            {
              productId: panoGovdesi.id,
              quantity: 3,
              discountPct: 5,
              vatPct: 20,
            },
            {
              productId: kontaktor.id,
              quantity: 12,
              discountPct: 0,
              vatPct: 20,
            },
          ],
          quoteDate: today,
          quoteCurrency: 'TRY' as const,
          leadTime: '5 is gunu',
          title: 'Marmara Pano - Yeni Proje Teklifi',
        });

        const approvedQuote3 = await quotes.create(ADMIN_USER_ID, {
          senderId: ADMIN_USER_ID,
          accountId: acc10.id,
          contactId: contact10.id,
          items: [
            {
              productId: nhSigorta.id,
              quantity: 4,
              discountPct: 0,
              vatPct: 20,
            },
            {
              productId: termikRole.id,
              quantity: 20,
              discountPct: 5,
              vatPct: 20,
            },
          ],
          quoteDate: today,
          quoteCurrency: 'TRY' as const,
          title: 'Ege Enerji - Olcum ve Role Teklifi',
        });
        await quotes.update(
          approvedQuote3.id,
          { status: 'APPROVED', warehouseId: mainWarehouse.id },
          ADMIN_USER_ID,
        );

        const approvedQuote4 = await quotes.create(ADMIN_USER_ID, {
          senderId: ADMIN_USER_ID,
          accountId: acc13.id,
          contactId: contact13.id,
          items: [
            {
              productId: kabloKanali.id,
              quantity: 200,
              discountPct: 0,
              vatPct: 20,
            },
            {
              productId: topraklamaSeti.id,
              quantity: 8,
              discountPct: 5,
              vatPct: 20,
            },
          ],
          quoteDate: today,
          quoteCurrency: 'TRY' as const,
          title: 'Boru Hatti Enerji - Altyapi Teklifi',
          opportunity: {
            name: 'Boru Hatti Enerji - Altyapi Yatirimi',
            stage: 'WON',
            estimatedValue: 180000,
          },
        });
        await quotes.update(
          approvedQuote4.id,
          { status: 'APPROVED', warehouseId: mainWarehouse.id },
          ADMIN_USER_ID,
        );

        const rejectedQuote2 = await quotes.create(ADMIN_USER_ID, {
          senderId: ADMIN_USER_ID,
          accountId: acc11.id,
          contactId: contact11.id,
          items: [
            {
              productId: nhSigorta.id,
              quantity: 15,
              discountPct: 0,
              vatPct: 20,
            },
          ],
          quoteDate: today,
          quoteCurrency: 'TRY' as const,
          title: 'Karadeniz Taahhut - Sigorta Teklifi',
        });
        await quotes.update(
          rejectedQuote2.id,
          { status: 'REJECTED' },
          ADMIN_USER_ID,
        );

        console.log('Ek projeler olusturuluyor...');
        const egeProject = await projects.create(ADMIN_USER_ID, {
          accountId: acc10.id,
          name: 'Ege Enerji - Olcum Sistemleri Kurulumu',
          estimatedBudget: 210000,
          actualCost: 165000,
        });
        await projects.update(egeProject.id, { quoteIds: [approvedQuote3.id] });
        await projects.create(ADMIN_USER_ID, {
          accountId: acc13.id,
          name: 'Boru Hatti Enerji - Altyapi Modernizasyonu',
          estimatedBudget: 190000,
        });

        console.log('Ek satin alma siparisi olusturuluyor...');
        const purchaseOrderDraft2 = await purchaseOrders.getDraftFromQuote(
          approvedQuote4.id,
        );
        await purchaseOrders.create(ADMIN_USER_ID, {
          quoteId: purchaseOrderDraft2.quoteId,
          items: [
            ...purchaseOrderDraft2.items.map((item) => ({
              productId: item.productId,
              description: '',
              quantity: item.quantity,
            })),
            {
              description: 'Montaj ve devreye alma hizmeti (ek kalem)',
              quantity: 1,
            },
          ],
        });

        console.log('Ek mesajlar olusturuluyor...');
        const msg2 = await messages.create(TENANT_ID, ADMIN_USER_ID, {
          subject: 'Ege Enerji teklifi onaylandi',
          body: 'Merhaba Elif, Ege Enerji icin teklif onaylandi, siparis surecini baslatabiliriz.',
          toUserIds: [secondUser.id],
          ccUserIds: [],
          relatedEntity: 'QUOTE',
          relatedEntityId: approvedQuote3.id,
        });
        await messages.create(TENANT_ID, secondUser.id, {
          subject: 'Re: Ege Enerji teklifi onaylandi',
          body: 'Tamamdir, siparisi kontrol ediyorum.',
          toUserIds: [ADMIN_USER_ID],
          ccUserIds: [],
          conversationId: msg2.conversationId ?? undefined,
        });
        await messages.create(TENANT_ID, ADMIN_USER_ID, {
          subject: 'Boru Hatti Enerji sunumu',
          body: 'Yarinki sunum icin teknik dosyalari hazirlar misin?',
          toUserIds: [secondUser.id],
          ccUserIds: [],
        });
        await messages.create(TENANT_ID, secondUser.id, {
          subject: 'Marmara Pano gorusmesi notlari',
          body: 'Marmara Pano ile yapilan gorusmede yeni proje ihtiyaclari konusuldu.',
          toUserIds: [ADMIN_USER_ID],
          ccUserIds: [],
        });

        console.log('Memnuniyet anketi gonderiliyor...');
        const postSaleList = await postSaleCases.list({
          page: 1,
          pageSize: 20,
        });
        if (postSaleList.data.length > 0) {
          await postSaleCases.sendSurvey(postSaleList.data[0]!.id, {});
          if (postSaleList.data.length > 1) {
            await postSaleCases.markFeedback(postSaleList.data[1]!.id, {
              responseNote: 'Musteri memnun, tekrar is birligi yapmak istiyor.',
            });
          }
        }

        console.log('BI dashboard ve widget olusturuluyor (Satis Raporu)...');
        const salesDataset = await prisma.dataset.findFirst({
          where: {
            tenantId: TENANT_ID,
            sourceKind: DatasetSourceKind.CRM_TABLE,
          },
        });
        if (salesDataset) {
          const dashboard = await dashboards.create(TENANT_ID, ADMIN_USER_ID, {
            name: 'Satis Performansi',
            description:
              'Teklif bazli ciro ve satisci performansi (sunum icin).',
          });
          await widgets.create(dashboard.id, {
            type: 'kpi',
            title: 'Toplam Ciro',
            querySpec: {
              datasetId: salesDataset.id,
              measures: [
                { field: 'lineTotal', agg: 'sum', alias: 'totalRevenue' },
              ],
              dimensions: [],
              filters: [],
              orderBy: [],
              limit: 1000,
            },
            vizOptions: {},
            position: { x: 0, y: 0, w: 3, h: 2 },
          });
          await widgets.create(dashboard.id, {
            type: 'bar',
            title: 'Satisci Bazli Ciro',
            querySpec: {
              datasetId: salesDataset.id,
              measures: [
                { field: 'lineTotal', agg: 'sum', alias: 'totalRevenue' },
              ],
              dimensions: [{ field: 'salesRepName' }],
              filters: [],
              orderBy: [],
              limit: 1000,
            },
            vizOptions: {},
            position: { x: 3, y: 0, w: 5, h: 4 },
          });
          await widgets.create(dashboard.id, {
            type: 'line',
            title: 'Aylik Ciro Trendi',
            querySpec: {
              datasetId: salesDataset.id,
              measures: [
                { field: 'lineTotal', agg: 'sum', alias: 'totalRevenue' },
              ],
              dimensions: [{ field: 'createdAt', granularity: 'month' }],
              filters: [],
              orderBy: [],
              limit: 1000,
            },
            vizOptions: {},
            position: { x: 0, y: 4, w: 8, h: 4 },
          });
          await widgets.create(dashboard.id, {
            type: 'table',
            title: 'Urun Bazli Satis Detayi',
            querySpec: {
              datasetId: salesDataset.id,
              measures: [
                { field: 'quantity', agg: 'sum', alias: 'totalQuantity' },
                { field: 'lineTotal', agg: 'sum', alias: 'totalRevenue' },
              ],
              dimensions: [{ field: 'productName' }],
              filters: [],
              orderBy: [],
              limit: 1000,
            },
            vizOptions: {},
            position: { x: 0, y: 8, w: 8, h: 4 },
          });
        } else {
          console.log('  -> CRM_TABLE dataset bulunamadi, dashboard atlandi.');
        }

        console.log(
          'Cizim modulu icin cizilebilir urunler + teklif + cizim olusturuluyor...',
        );
        const drawingTemplate = await prisma.drawingPanelTemplate.findFirst({});
        if (drawingTemplate) {
          const drawingList = await productLists.create({
            name: 'Cizim Kutuphanesi (Sunum)',
          });
          const drawingProductDefs = [
            {
              name: 'Kompakt Salter 160A',
              sku: 'SAL-160A-S',
              unit: 'adet',
              price: 3200,
              category: 'Salter',
              drawingSpec: {
                widthMm: 150,
                heightMm: 200,
                libraryComponentKey: 'switch-compact',
                bandKey: 'main-breaker',
                bandOrder: 0,
              },
            },
            {
              name: 'Kontaktor 40A (Cizim)',
              sku: 'KNT-40A-S',
              unit: 'adet',
              price: 780,
              category: 'Kontaktor',
              drawingSpec: {
                widthMm: 100,
                heightMm: 120,
                libraryComponentKey: 'contactor',
                bandKey: 'outgoing',
                bandOrder: 0,
              },
            },
            {
              name: 'Koruma Rolesi (Cizim)',
              sku: 'ROL-01-S',
              unit: 'adet',
              price: 320,
              category: 'Role',
              drawingSpec: {
                widthMm: 50,
                heightMm: 80,
                libraryComponentKey: 'relay',
                bandKey: 'outgoing',
                bandOrder: 1,
              },
            },
            {
              name: 'Klemens Seti 16mm2 (Cizim)',
              sku: 'KLM-16-S',
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
          ] as const;
          const drawingProducts = [];
          for (const def of drawingProductDefs) {
            drawingProducts.push(
              await products.create({
                productListId: drawingList.id,
                name: def.name,
                sku: def.sku,
                unit: def.unit,
                price: def.price,
                currency: 'TRY',
                category: def.category,
                drawingSpec: def.drawingSpec,
              }),
            );
          }
          const [salterD, kontaktorD, roleD, klemensD] = drawingProducts;
          const drawingQuote = await quotes.create(ADMIN_USER_ID, {
            senderId: ADMIN_USER_ID,
            accountId: acc9.id,
            items: [
              {
                productId: salterD!.id,
                quantity: 1,
                discountPct: 0,
                vatPct: 20,
              },
              {
                productId: kontaktorD!.id,
                quantity: 3,
                discountPct: 0,
                vatPct: 20,
              },
              { productId: roleD!.id, quantity: 3, discountPct: 0, vatPct: 20 },
              {
                productId: klemensD!.id,
                quantity: 1,
                discountPct: 0,
                vatPct: 20,
              },
            ],
            quoteDate: today,
            quoteCurrency: 'TRY' as const,
            leadTime: '5 is gunu',
            title: 'Marmara Pano - AG Pano Cizim Teklifi',
          });
          await drawings.createFromProductSelection({
            quoteId: drawingQuote.id,
            templateId: drawingTemplate.id,
            name: 'Marmara Pano - AG Pano Cizimi',
            items: [
              { productId: salterD!.id, quantity: 1 },
              { productId: kontaktorD!.id, quantity: 3 },
              { productId: roleD!.id, quantity: 3 },
              { productId: klemensD!.id, quantity: 1 },
            ],
          });
        } else {
          console.log('  -> Hazir cizim sablonu bulunamadi, cizim atlandi.');
        }

        void stockItems;
      },
    );

    console.log('');
    console.log('Sunum icin ek demo verisi basariyla eklendi.');
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ek seed basarisiz oldu:', err);
    process.exit(1);
  });
