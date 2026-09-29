import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagesCacheService } from './messages-cache.service';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [NotificationsModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesCacheService],
  exports: [MessagesService, MessagesCacheService],
})
export class MessagesModule {}
