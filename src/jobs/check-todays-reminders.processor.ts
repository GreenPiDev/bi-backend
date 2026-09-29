import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { RealtimeService } from '../core/realtime/realtime.service';
import { TODAYS_REMINDERS_QUEUE } from './todays-reminders-queue.constants';

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfTomorrow(): Date {
  return new Date(startOfToday().getTime() + 24 * 60 * 60 * 1000);
}

function formatDateTr(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
}

interface DailyReminderGroup {
  tenantId: string;
  recipientUserId: string;
  count: number;
}

/**
 * Kullanicinin "bugun icin kurulmus hatirlaticilariniz var" bildirimi - kaynagi ne
 * olursa olsun (dogrudan /ajanda'dan kurulan genel hatirlatici veya bir gorusmeye
 * bagli olan, bkz. send-interaction-reminders.processor.ts) bugun baslayan ve
 * kullanicinin katilimci oldugu TUM CalendarEvent'leri tek bir bildirimde toplar -
 * kullanici kendine tek basina bir hatirlatici kurmus olsa bile (isPrivateToCreator)
 * dahildir, ayrica bir filtre yok. send-interaction-reminders'daki e-posta
 * mekanizmasindan tamamen bagimsizdir (farkli kanal, farkli amac) - CalendarEventAttendee.
 * notifiedAt'i PAYLASMAZ, kendi tekilligini bugun icin zaten olusturulmus bir
 * Notification kaydi olup olmadigina bakarak saglar (bkz. notifyUser).
 */
@Processor(TODAYS_REMINDERS_QUEUE)
export class CheckTodaysRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(CheckTodaysRemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const from = startOfToday();
    const to = startOfTomorrow();

    const events = await this.prisma.calendarEvent.findMany({
      where: { deletedAt: null, startAt: { gte: from, lt: to } },
      include: { attendees: true },
    });

    const groups = new Map<string, DailyReminderGroup>();
    for (const event of events) {
      for (const attendee of event.attendees) {
        // Ad-hoc (2026-09-29): PENDING/DECLINED katilimciya "bugun icin hatirlaticiniz
        // var" gitmemeli - henuz kabul etmedigi bir etkinlik onun takviminde degil.
        if (attendee.status !== 'ACCEPTED') {
          continue;
        }
        const key = `${event.tenantId}:${attendee.userId}`;
        const existing = groups.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          groups.set(key, {
            tenantId: event.tenantId,
            recipientUserId: attendee.userId,
            count: 1,
          });
        }
      }
    }

    for (const group of groups.values()) {
      try {
        await this.notifyUser(group, from);
      } catch (err) {
        this.logger.warn(
          `Bugunku hatirlatici bildirimi basarisiz (tenant ${group.tenantId}, kullanici ${group.recipientUserId}): ${(err as Error).message}`,
        );
      }
    }
  }

  private async notifyUser(
    { tenantId, recipientUserId, count }: DailyReminderGroup,
    todayStart: Date,
  ): Promise<void> {
    const alreadyNotifiedToday = await this.prisma.notification.findFirst({
      where: {
        tenantId,
        recipientUserId,
        type: 'CALENDAR_REMINDERS_DUE_TODAY',
        createdAt: { gte: todayStart },
      },
    });
    if (alreadyNotifiedToday) {
      return;
    }

    await this.prisma.notification.create({
      data: {
        tenantId,
        recipientUserId,
        type: 'CALENDAR_REMINDERS_DUE_TODAY',
        title: `Bugün (${formatDateTr(todayStart)}) için kurulmuş ${count} hatırlatıcınız var. Görmek için tıklayın.`,
        relatedEntityType: 'CalendarEvent',
      },
    });
    this.realtime.emitToTenant(tenantId, 'notifications.notification.created', {
      recipientUserId,
    });
  }
}
