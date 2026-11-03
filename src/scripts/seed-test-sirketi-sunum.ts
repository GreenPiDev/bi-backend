/**
 * Tek seferlik lokal script: "Test Sirketi" kiracisina (testi sirasinda biriken,
 * cogunlukla test amacli olusturulmus veriyi bozmadan) /anasayfa ekraninin ozet
 * istatistiklerini (toplam gorusme/firsat/proje, okunmamis mesaj, kritik stok)
 * teşvik basvurusu dosyasi icin ekran goruntusu alinabilecek sekilde zenginlestirir.
 *
 * Idempotent DEGIL - tekrar calistirilmadan once "Sunum Icin Ek Veri" adinda
 * bir gorusme olup olmadigi kontrol edilir, varsa erken cikilir.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../core/prisma/prisma.service';
import { TenantContext } from '../core/tenant/tenant-context';
import { RealtimeService } from '../core/realtime/realtime.service';
import { InteractionsService } from '../modules/interactions/interactions.service';
import { OpportunitiesService } from '../modules/opportunities/opportunities.service';
import { ProjectsService } from '../modules/projects/projects.service';
import { MessagesService } from '../modules/messages/messages.service';
import { CalendarEventsService } from '../modules/calendar-events/calendar-events.service';
import { InteractionTypeOptionsService } from '../modules/interaction-type-options/interaction-type-options.service';

const TENANT_ID = '00a01e32-00f7-4ba8-aac6-f8c5373ebd4d';
const ADMIN_USER_ID = '6502a566-9339-4a81-9772-9501a95f5b02'; // companyadmin@test.com
const SECOND_USER_ID = 'bc95550d-4876-49a2-afef-a3911ccfc0f9'; // temelkullanici@test.com
const GUARD_NOTE = 'Sunum Icin Ek Veri';

function daysFromNow(days: number, hour = 10): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
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

    const guardExisting = await prisma.interaction.findFirst({
      where: { tenantId: TENANT_ID, notes: GUARD_NOTE },
    });
    if (guardExisting) {
      console.log('Bu script zaten calistirilmis - cikiliyor.');
      return;
    }

    const interactions = app.get(InteractionsService);
    const opportunities = app.get(OpportunitiesService);
    const projects = app.get(ProjectsService);
    const messages = app.get(MessagesService);
    const calendarEvents = app.get(CalendarEventsService);
    const interactionTypeOptions = app.get(InteractionTypeOptionsService);

    await TenantContext.run(
      { tenantId: TENANT_ID, userId: ADMIN_USER_ID, roleIds: [] },
      async () => {
        console.log('Gorusme sekli secenekleri ekleniyor...');
        for (const label of [
          'Telefon Görüşmesi',
          'Toplantı',
          'Saha Ziyareti',
          'E-posta',
        ]) {
          try {
            await interactionTypeOptions.create({ label });
          } catch {
            // zaten varsa (unique constraint) sessizce gec
          }
        }

        console.log('Temsili cariler seciliyor...');
        // Gercekci gorunumlu (bosluklu) isimli, ciplak test verisini (ör. "ABC",
        // "ASDSADAS") eleyen bir havuzdan seciyoruz.
        const accounts = await prisma.account.findMany({
          where: {
            tenantId: TENANT_ID,
            deletedAt: null,
            name: { contains: ' ' },
          },
          select: { id: true, name: true },
          orderBy: { createdAt: 'asc' },
          take: 60,
        });
        if (accounts.length < 10) {
          throw new Error('Yeterli sayida gercekci cari bulunamadi.');
        }
        const contacts = await prisma.contact.findMany({
          where: {
            tenantId: TENANT_ID,
            deletedAt: null,
            accountId: { not: null },
          },
          select: { id: true, accountId: true },
        });
        const contactByAccount = new Map(
          contacts.map((c) => [c.accountId, c.id]),
        );

        const pick = (n: number) =>
          [...accounts].sort(() => Math.random() - 0.5).slice(0, n);

        console.log('Ek gorusmeler olusturuluyor...');
        // InteractionTypeOptionsService.create etiketleri DB'ye buyuk harfle
        // yaziyor (tr-TR locale normalizasyonu), assertValidInteractionType de
        // tam esitlik bekliyor - bu yuzden ayni normalizasyonu burada da uyguluyoruz.
        const interactionTypes = [
          'Telefon Görüşmesi',
          'Toplantı',
          'Saha Ziyareti',
          'E-posta',
        ].map((label) => label.toLocaleUpperCase('tr-TR'));
        const interactionAccounts = pick(16);
        for (let i = 0; i < interactionAccounts.length; i += 1) {
          const acc = interactionAccounts[i]!;
          await interactions.create(TENANT_ID, ADMIN_USER_ID, {
            accountId: acc.id,
            contactId: contactByAccount.get(acc.id),
            type: interactionTypes[i % interactionTypes.length]!,
            notes: GUARD_NOTE,
            occurredAt: daysFromNow(-(i + 1)),
          });
        }

        console.log('Ek firsatlar olusturuluyor...');
        const stages = ['NEW', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'] as const;
        const opportunityAccounts = pick(10);
        for (let i = 0; i < opportunityAccounts.length; i += 1) {
          const acc = opportunityAccounts[i]!;
          await opportunities.create(TENANT_ID, ADMIN_USER_ID, {
            accountId: acc.id,
            name: `${acc.name} - Yeni Fırsat`,
            stage: stages[i % stages.length],
            estimatedValue: 50_000 + i * 17_500,
          });
        }

        console.log('Ek projeler olusturuluyor...');
        const projectAccounts = pick(8);
        for (let i = 0; i < projectAccounts.length; i += 1) {
          const acc = projectAccounts[i]!;
          await projects.create(ADMIN_USER_ID, {
            accountId: acc.id,
            name: `${acc.name} - Saha Projesi`,
            estimatedBudget: 120_000 + i * 22_000,
            actualCost: 80_000 + i * 15_000,
          });
        }

        console.log('Okunmamis mesajlar olusturuluyor...');
        const inboundSubjects = [
          'Yarinki ziyaret icin hazirlik',
          'Teklif onayi bekleyen dosyalar',
          'Stok durumu hakkinda',
          'Yeni proje teklifi taslagi',
          'Musteri geri bildirimi',
        ];
        for (const subject of inboundSubjects) {
          await messages.create(TENANT_ID, SECOND_USER_ID, {
            subject,
            body: GUARD_NOTE,
            toUserIds: [ADMIN_USER_ID],
            ccUserIds: [],
          });
        }
        const outboundSubjects = [
          'Haftalik satis ozeti',
          'Toplanti notlarini paylasiyorum',
          'Saha ziyareti raporu',
        ];
        for (const subject of outboundSubjects) {
          await messages.create(TENANT_ID, ADMIN_USER_ID, {
            subject,
            body: GUARD_NOTE,
            toUserIds: [SECOND_USER_ID],
            ccUserIds: [],
          });
        }

        console.log('Bugun icin hatirlatici/etkinlikler olusturuluyor...');
        const todayTitles = [
          'Sabah satis degerlendirme toplantisi',
          'Saha ekibiyle telefon gorusmesi',
          'Teklif onay takibi',
        ];
        for (let i = 0; i < todayTitles.length; i += 1) {
          const start = daysFromNow(0, 9 + i * 2);
          await calendarEvents.create(TENANT_ID, ADMIN_USER_ID, {
            title: todayTitles[i]!,
            description: GUARD_NOTE,
            startAt: start,
            endAt: new Date(start.getTime() + 60 * 60 * 1000),
            attendees: [{ userId: ADMIN_USER_ID }, { userId: SECOND_USER_ID }],
          });
        }
      },
    );

    console.log('Kritik stok seviyeleri guncelleniyor...');
    const stockRows = await prisma.stockItem.findMany({
      where: { tenantId: TENANT_ID },
      select: { productId: true },
    });
    for (const row of stockRows) {
      await prisma.product.update({
        where: { id: row.productId },
        data: { minStockLevel: 5 },
      });
    }

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
