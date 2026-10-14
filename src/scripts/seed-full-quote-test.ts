/**
 * Tek seferlik yardimci script: "Test Sirketi" kiracisina, Quote modelindeki
 * (hemen hemen) TUM alanlari doldurulmus bir teklif ekler - manuel UI testi/kontrolu
 * icin (kullanici talebi). seed-quote-to-drawing-test.ts ile ayni calisma deseni.
 *
 * Idempotent DEGIL - tekrar calistirilirsa kisi/proje/sablon/teklif TEKRAR olusturulur.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RealtimeService } from '../core/realtime/realtime.service';
import { TenantContext } from '../core/tenant/tenant-context';
import { ContactsService } from '../modules/contacts/contacts.service';
import { ProjectsService } from '../modules/projects/projects.service';
import { QuoteTemplatesService } from '../modules/quote-templates/quote-templates.service';
import { QuotesService } from '../modules/quotes/quotes.service';

const TENANT_ID = '00a01e32-00f7-4ba8-aac6-f8c5373ebd4d'; // Test Sirketi
const ADMIN_USER_ID = '6502a566-9339-4a81-9772-9501a95f5b02'; // companyadmin@test.com

const ACCOUNT_ID = 'beb67592-f624-45b3-8773-2c858d917604'; // ABC
const PRODUCT_ID = '339147ed-62d9-4334-863d-e0bd17b2a319'; // Deneme Urun
const IBAN_OPTION_GROUP_ID = 'af19fd7b-bbfa-4d41-b873-be5513c57fe8'; // Standart
const WAREHOUSE_ID = '95b62195-4e98-43c6-9bed-209ae7a869b0'; // Ana Depo
const PAYMENT_METHOD_LABEL = 'ö1';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const realtime = app.get(RealtimeService);
    realtime.emitToTenant = () => undefined;
    realtime.emitToAll = () => undefined;

    const contacts = app.get(ContactsService);
    const projects = app.get(ProjectsService);
    const quoteTemplates = app.get(QuoteTemplatesService);
    const quotes = app.get(QuotesService);

    await TenantContext.run(
      { tenantId: TENANT_ID, userId: ADMIN_USER_ID, roleIds: [] },
      async () => {
        console.log('Kisi (muhatap) olusturuluyor...');
        const contact = await contacts.create(ADMIN_USER_ID, {
          firstName: 'Ayşe',
          lastName: 'Yılmaz',
          accountId: ACCOUNT_ID,
          title: 'u1',
          department: 'd1',
          email: 'ayse.yilmaz@abc-test.com',
          phone: '+90 532 111 22 33',
          status: 'ACTIVE',
        });

        console.log('Teklif şablonu oluşturuluyor...');
        const template = await quoteTemplates.create(ADMIN_USER_ID, {
          name: 'Tam Alan Test Şablonu',
          isDefault: false,
          companyDisplayName: 'Test Şirketi A.Ş.',
          companyTagline: 'Güvenilir çözüm ortağınız',
        });

        console.log('Proje oluşturuluyor...');
        const project = await projects.create(ADMIN_USER_ID, {
          accountId: ACCOUNT_ID,
          name: 'Tam Alan Test Projesi',
          estimatedBudget: 50000,
          actualCost: 10000,
          responsibleUserIds: [ADMIN_USER_ID],
        });

        console.log('Teklif oluşturuluyor...');
        const quote = await quotes.create(ADMIN_USER_ID, {
          accountId: ACCOUNT_ID,
          contactId: contact.id,
          items: [
            {
              productId: PRODUCT_ID,
              quantity: 5,
              unitPrice: 1200,
              discountPct: 10,
              vatPct: 20,
            },
          ],
          opportunity: {
            name: 'Tam Alan Test Fırsatı',
            stage: 'PROPOSAL',
            estimatedValue: 6000,
          },
          quoteDate: new Date(),
          leadTime: '5 iş günü',
          paymentMethod: PAYMENT_METHOD_LABEL,
          title: 'Tam Alan Test Teklifi',
          paymentTerms: '%50 peşin, %50 teslimde.',
          salesTerms: 'Fiyatlara KDV dahil değildir.',
          deliveryTerms: 'Teslimat fabrika çıkışı (EXW) yapılacaktır.',
          generalTerms: 'Bu teklif 30 gün süreyle geçerlidir.',
          ibanOptionGroupIds: [IBAN_OPTION_GROUP_ID],
          quoteCurrency: 'TRY',
          templateId: template.id,
          senderId: ADMIN_USER_ID,
        });

        console.log('Teklif projeye bağlanıyor...');
        await projects.update(project.id, { quoteIds: [quote.id] });

        console.log('Teklif onay akışına alınıyor...');
        await quotes.update(
          quote.id,
          { status: 'PENDING_APPROVAL' },
          ADMIN_USER_ID,
        );

        console.log('Teklif onaylanıyor...');
        const approved = await quotes.approve(quote.id, ADMIN_USER_ID, {
          warehouseId: WAREHOUSE_ID,
        });

        console.log('\nTamamlandı:');
        console.log(
          `  Kişi: ${contact.firstName} ${contact.lastName} (${contact.id})`,
        );
        console.log(`  Şablon: ${template.name} (${template.id})`);
        console.log(`  Proje: ${project.name} (${project.id})`);
        console.log(
          `  Teklif: ${approved.quoteNumber} (${approved.id}) - durum: ${approved.status}`,
        );
        console.log(
          `\n/teklifler/${approved.id} sayfasından kontrol edebilirsin.`,
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
