import { Module } from '@nestjs/common';
import { MessagesCacheService } from './messages-cache.service';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, MessagesCacheService],
  exports: [MessagesService, MessagesCacheService],
})
export class MessagesModule {}
