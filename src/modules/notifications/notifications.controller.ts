import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import type { Notification } from '@prisma/client';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  NotificationQuerySchema,
  SetNotificationReadSchema,
  type NotificationQueryDto,
  type SetNotificationReadDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

/**
 * Bilerek hicbir @RequiresPermission/@ModulePage tasimiyor - bildirimler tamamen
 * kisisel veridir (bkz. /users/me/avatar ile ayni desen), her giris yapmis kullanici
 * sadece KENDI bildirimlerine erisebilir (izolasyon service katmaninda,
 * recipientUserId filtresiyle saglanir).
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('unread')
  listUnread(@CurrentUser() user: RequestUser): Promise<Notification[]> {
    return this.notifications.listUnread(user.id);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(NotificationQuerySchema))
    query: NotificationQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PagedResult<Notification>> {
    return this.notifications.list(user.id, query);
  }

  @Patch(':id/read')
  @HttpCode(204)
  setRead(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SetNotificationReadSchema))
    dto: SetNotificationReadDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.notifications.setRead(id, user.id, dto.read);
  }
}
