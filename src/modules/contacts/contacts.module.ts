import { Module } from '@nestjs/common';
import { ContactsCacheService } from './contacts-cache.service';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
  controllers: [ContactsController],
  providers: [ContactsService, ContactsCacheService],
  exports: [ContactsService, ContactsCacheService],
})
export class ContactsModule {}
