import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { FileUrlService } from '../../core/storage/file-url.service';

export interface CalendarShareUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

@Injectable()
export class CalendarSharesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly fileUrl: FileUrlService,
    private readonly realtime: RealtimeService,
  ) {}

  /** CalendarEventAttendee.userId ile ayni desen: gercek FK degil, bagimsiz
   * dogrulama gerekir (bkz. CalendarEventsService.assertUsersExist). */
  private async assertUsersExist(userIds: string[]): Promise<void> {
    const ids = [...new Set(userIds)];
    if (!ids.length) {
      return;
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (users.length !== ids.length) {
      throw new AppException(
        'USER_NOT_FOUND',
        'Secilen kullanicilardan biri bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async usersToShareUsers(
    userIds: string[],
  ): Promise<CalendarShareUser[]> {
    if (!userIds.length) {
      return [];
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatarKey: true, updatedAt: true },
      orderBy: { name: 'asc' },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      avatarUrl: this.fileUrl.build(user.avatarKey, user.updatedAt),
    }));
  }

  /** Ajandami kimlerin gorebildigi (ben owner'im). */
  async getGrants(ownerId: string): Promise<CalendarShareUser[]> {
    const rows = await this.prisma.calendarShare.findMany({
      where: { ownerId },
      select: { viewerId: true },
    });
    return this.usersToShareUsers(rows.map((row) => row.viewerId));
  }

  /** Tam set replace - ListSettingsSection'daki gibi kullanici degisiklikte
   * hemen kaydeder, ayri bir "kaydet" butonu yok (frontend). Kendine izin
   * vermek anlamsiz oldugu icin sessizce elenir. Degisiklik sonrasi tum tenant'a
   * yayinlanir - payload'un icerigiyle ilgilenmeden invalidate eden
   * notifications.notification.created/messages.message.created ile ayni desen
   * (bkz. use-calendar-shares-realtime-sync.ts) - boylece /ajanda dropdown'i,
   * kendisine yeni izin verilen kullanicinin ekraninda sayfa yenilemeden guncellenir. */
  async setGrants(
    tenantId: string,
    ownerId: string,
    viewerIds: string[],
  ): Promise<void> {
    const ids = [...new Set(viewerIds)].filter((id) => id !== ownerId);
    await this.assertUsersExist(ids);
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarShare.deleteMany({ where: { ownerId } });
      if (ids.length > 0) {
        await tx.calendarShare.createMany({
          data: ids.map((viewerId) => ({ ownerId, viewerId })) as never,
        });
      }
    });
    this.realtime.emitToTenant(tenantId, 'calendar-shares.grants.updated', {
      ownerId,
    });
  }

  /** Kimlerin ajandasini gorebildigim (ben viewer'im) - /ajanda dropdown'i. */
  async getSharedWithMe(viewerId: string): Promise<CalendarShareUser[]> {
    const rows = await this.prisma.calendarShare.findMany({
      where: { viewerId },
      select: { ownerId: true },
    });
    return this.usersToShareUsers(rows.map((row) => row.ownerId));
  }

  async canView(ownerId: string, viewerId: string): Promise<boolean> {
    if (ownerId === viewerId) {
      return true;
    }
    const share = await this.prisma.calendarShare.findFirst({
      where: { ownerId, viewerId },
      select: { id: true },
    });
    return Boolean(share);
  }
}
