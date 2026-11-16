import { Module } from '@nestjs/common';
import {
  PlatformAdminSupportTicketsController,
  SupportTicketsController,
} from './support-tickets.controller';
import { SupportTicketsAdminService } from './support-tickets-admin.service';
import { SupportTicketsService } from './support-tickets.service';
import { SupportTicketNotifierService } from './support-ticket-notifier.service';

@Module({
  controllers: [
    SupportTicketsController,
    PlatformAdminSupportTicketsController,
  ],
  providers: [
    SupportTicketsService,
    SupportTicketsAdminService,
    SupportTicketNotifierService,
  ],
})
export class SupportTicketsModule {}
