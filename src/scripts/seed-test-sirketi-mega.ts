/**
 * Tek seferlik lokal script: "Test Sirketi" kiracisina, /anasayfa ozetindeki
 * sayilarin (Toplam Teklif/Gorusme/Firsat/Proje, okunmamis mesaj) uc haneli
 * seviyelere ulasmasi icin buyuk hacimli, ~14 aya yayilmis tarihli veri ekler -
 * "uzun suredir kullanilan bir sirket" izlenimi icin (teşvik basvurusu ekran
 * goruntusu). seed-test-sirketi-sunum.ts'in uzerine, onunla cakismadan calisir.
 *
 * Idempotent DEGIL - tekrar calistirilmadan once GUARD_NOTE'lu bir gorusme olup
 * olmadigi kontrol edilir, varsa erken cikilir.
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
import { QuotesService } from '../modules/quotes/quotes.service';

const TENANT_ID = '00a01e32-00f7-4ba8-aac6-f8c5373ebd4d';
const ADMIN_USER_ID = '6502a566-9339-4a81-9772-9501a95f5b02'; // companyadmin@test.com
const SECOND_USER_ID = 'bc95550d-4876-49a2-afef-a3911ccfc0f9'; // temelkullanici@test.com
const GUARD_NOTE = 'Mega Sunum Verisi';

const INTERACTION_COUNT = 240;
const OPPORTUNITY_COUNT = 160;
const PROJECT_COUNT = 130;
const QUOTE_COUNT = 160;
const INBOUND_MESSAGE_COUNT = 140;
const OUTBOUND_MESSAGE_COUNT = 90;

/** Gecmise dogru, bugunden "daysAgoMax" gune kadar rastgele bir an. */
function randomPastDate(daysAgoMax: number): Date {
  const daysAgo = Math.floor(Math.random() * daysAgoMax);
  const hour = 8 + Math.floor(Math.random() * 9);
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return date;
}

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
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
    const quotes = app.get(QuotesService);

    const accounts = await prisma.account.findMany({
      where: { tenantId: TENANT_ID, deletedAt: null, name: { contains: ' ' } },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    if (accounts.length < 10) {
      throw new Error('Yeterli sayida gercekci cari bulunamadi.');
    }

    const tryProducts = await prisma.product.findMany({
      where: {
        tenantId: TENANT_ID,
        deletedAt: null,
        currency: 'TRY',
        price: { lt: 1_000_000 },
      },
      select: { id: true },
    });
    if (tryProducts.length < 3) {
      throw new Error('Yeterli sayida TRY fiyatli urun bulunamadi.');
    }

    const existingOptions = await prisma.interactionTypeOption.findMany({
      select: { label: true },
    });
    const interactionTypes =
      existingOptions.length > 0
        ? existingOptions.map((o) => o.label)
        : ['TOPLANTI'];

    const stages = ['NEW', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'] as const;

    await TenantContext.run(
      { tenantId: TENANT_ID, userId: ADMIN_USER_ID, roleIds: [] },
      async () => {
        console.log(`Ek gorusmeler olusturuluyor (${INTERACTION_COUNT})...`);
        for (let i = 0; i < INTERACTION_COUNT; i += 1) {
          const acc = pickOne(accounts);
          await interactions.create(TENANT_ID, ADMIN_USER_ID, {
            accountId: acc.id,
            type: pickOne(interactionTypes),
            notes: GUARD_NOTE,
            occurredAt: randomPastDate(420),
          });
          if ((i + 1) % 40 === 0)
            console.log(`  ... ${i + 1}/${INTERACTION_COUNT}`);
        }

        console.log(`Ek firsatlar olusturuluyor (${OPPORTUNITY_COUNT})...`);
        for (let i = 0; i < OPPORTUNITY_COUNT; i += 1) {
          const acc = pickOne(accounts);
          await opportunities.create(TENANT_ID, ADMIN_USER_ID, {
            accountId: acc.id,
            name: `${acc.name} - Firsat #${i + 1}`,
            stage: pickOne([...stages]),
            estimatedValue: 25_000 + Math.floor(Math.random() * 500_000),
            occurredAt: randomPastDate(420),
          });
          if ((i + 1) % 40 === 0)
            console.log(`  ... ${i + 1}/${OPPORTUNITY_COUNT}`);
        }

        console.log(`Ek projeler olusturuluyor (${PROJECT_COUNT})...`);
        for (let i = 0; i < PROJECT_COUNT; i += 1) {
          const acc = pickOne(accounts);
          const budget = 80_000 + Math.floor(Math.random() * 600_000);
          await projects.create(ADMIN_USER_ID, {
            accountId: acc.id,
            name: `${acc.name} - Proje #${i + 1}`,
            estimatedBudget: budget,
            actualCost: Math.floor(budget * (0.5 + Math.random() * 0.4)),
          });
          if ((i + 1) % 40 === 0)
            console.log(`  ... ${i + 1}/${PROJECT_COUNT}`);
        }

        console.log(`Ek teklifler olusturuluyor (${QUOTE_COUNT})...`);
        for (let i = 0; i < QUOTE_COUNT; i += 1) {
          const acc = pickOne(accounts);
          const itemCount = 1 + Math.floor(Math.random() * 3);
          const items = Array.from({ length: itemCount }, () => ({
            productId: pickOne(tryProducts).id,
            quantity: 1 + Math.floor(Math.random() * 20),
            discountPct: Math.floor(Math.random() * 10),
            vatPct: 20,
          }));
          await quotes.create(ADMIN_USER_ID, {
            senderId: ADMIN_USER_ID,
            accountId: acc.id,
            items,
            quoteDate: randomPastDate(420),
            quoteCurrency: 'TRY' as const,
            title: `${acc.name} - Teklif #${i + 1}`,
          });
          if ((i + 1) % 40 === 0) console.log(`  ... ${i + 1}/${QUOTE_COUNT}`);
        }

        console.log(
          `Okunmamis mesajlar olusturuluyor (${INBOUND_MESSAGE_COUNT} gelen, ${OUTBOUND_MESSAGE_COUNT} giden)...`,
        );
        const inboundTopics = [
          'Ziyaret hazirligi',
          'Teklif onayi bekleyen dosyalar',
          'Stok durumu',
          'Yeni proje taslagi',
          'Musteri geri bildirimi',
          'Fiyat guncellemesi',
          'Sozlesme taslagi',
          'Teslimat takibi',
          'Odeme hatirlatmasi',
          'Saha raporu',
        ];
        for (let i = 0; i < INBOUND_MESSAGE_COUNT; i += 1) {
          await messages.create(TENANT_ID, SECOND_USER_ID, {
            subject: `${pickOne(inboundTopics)} #${i + 1}`,
            body: GUARD_NOTE,
            toUserIds: [ADMIN_USER_ID],
            ccUserIds: [],
          });
          if ((i + 1) % 40 === 0)
            console.log(`  ... ${i + 1}/${INBOUND_MESSAGE_COUNT}`);
        }
        const outboundTopics = [
          'Haftalik satis ozeti',
          'Toplanti notlari',
          'Saha ziyareti raporu',
          'Teklif durumu',
          'Proje ilerlemesi',
        ];
        for (let i = 0; i < OUTBOUND_MESSAGE_COUNT; i += 1) {
          await messages.create(TENANT_ID, ADMIN_USER_ID, {
            subject: `${pickOne(outboundTopics)} #${i + 1}`,
            body: GUARD_NOTE,
            toUserIds: [SECOND_USER_ID],
            ccUserIds: [],
          });
          if ((i + 1) % 40 === 0)
            console.log(`  ... ${i + 1}/${OUTBOUND_MESSAGE_COUNT}`);
        }
      },
    );

    console.log('');
    console.log('Mega sunum verisi basariyla eklendi.');
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Mega seed basarisiz oldu:', err);
    process.exit(1);
  });
