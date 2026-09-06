import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { MailService } from '../core/mail/mail.service';
import { INTERACTION_REMINDER_QUEUE } from './interaction-reminder-queue.constants';

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfTomorrow(): Date {
  const today = startOfToday();
  return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * M4/M8/M9: Faz 11c hatirlatmalari icin ayri bir CalendarReminder modeli
 * kurulmadi (bkz. docs/VARSAYIMLAR.md V26) - bu is, bugun baslayan ve
 * relatedEntityType='Interaction' olan CalendarEvent/CalendarEventAttendee
 * satirlarini tarar. M8: iliskili Interaction 'OPEN' degilse atlanir (notifiedAt
 * isaretlenmez, sonsuza kadar PENDING kalir - zararsiz, is her gun sadece
 * "bugun" araligini taradigi icin tekrar denenmez).
 */
@Processor(INTERACTION_REMINDER_QUEUE)
export class SendInteractionRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(SendInteractionRemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const attendees = await this.prisma.calendarEventAttendee.findMany({
      where: {
        notifiedAt: null,
        event: {
          relatedEntityType: 'Interaction',
          deletedAt: null,
          startAt: { gte: startOfToday(), lt: startOfTomorrow() },
        },
      },
      include: { event: { include: { attendees: true } } },
    });

    for (const attendee of attendees) {
      try {
        await this.notify(attendee);
      } catch (err) {
        this.logger.warn(
          `Hatirlatma gonderilemedi (attendee ${attendee.id}): ${(err as Error).message}`,
        );
      }
    }
  }

  private async notify(attendee: {
    id: string;
    userId: string;
    note: string | null;
    event: {
      id: string;
      title: string;
      relatedEntityId: string | null;
      attendees: { userId: string }[];
    };
  }): Promise<void> {
    const interaction = attendee.event.relatedEntityId
      ? await this.prisma.interaction.findFirst({
          where: { id: attendee.event.relatedEntityId, deletedAt: null },
        })
      : null;
    if (!interaction || interaction.status !== 'OPEN') {
      return; // M8: gorusme kapaliysa hatirlatma gonderilmez
    }

    const user = await this.prisma.user.findFirst({
      where: { id: attendee.userId },
    });
    if (!user) {
      return;
    }

    const ccEmails = (
      await this.prisma.user.findMany({
        where: {
          id: {
            in: attendee.event.attendees
              .map((a) => a.userId)
              .filter((id) => id !== attendee.userId),
          },
        },
        select: { email: true },
      })
    ).map((u) => u.email);

    await this.mail.send({
      to: [user.email],
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject: `PiLens - Hatirlatma: ${attendee.event.title}`,
      text: attendee.note
        ? `${attendee.event.title}\n\n${attendee.note}`
        : attendee.event.title,
    });

    await this.prisma.calendarEventAttendee.update({
      where: { id: attendee.id },
      data: { notifiedAt: new Date() },
    });
  }
}
