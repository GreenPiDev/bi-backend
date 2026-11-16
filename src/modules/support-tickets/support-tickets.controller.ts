import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../core/guards/platform-admin.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  AdminListSupportTicketsQuerySchema,
  AdminUpdateSupportTicketStatusSchema,
  CreateSupportTicketMessageSchema,
  CreateSupportTicketSchema,
  type AdminListSupportTicketsQueryDto,
  type AdminUpdateSupportTicketStatusDto,
  type CreateSupportTicketDto,
  type CreateSupportTicketMessageDto,
} from './dto/support-ticket.dto';
import type {
  AdminSupportTicketView,
  SupportTicketView,
} from './support-ticket-view';
import { SupportTicketsAdminService } from './support-tickets-admin.service';
import { SupportTicketsService } from './support-tickets.service';

/**
 * Teknik Destek (tenant tarafi). Bilerek @RequiresPermission/@ModulePage tasimiyor:
 * sayfa tum tenant'larda ve tum kullanicilara acik (page-registry'de alwaysVisible,
 * NotesController ile ayni desen) - bkz. docs/VARSAYIMLAR.md V84.
 */
@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly tickets: SupportTicketsService) {}

  @Get()
  list(): Promise<SupportTicketView[]> {
    return this.tickets.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateSupportTicketSchema))
    dto: CreateSupportTicketDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SupportTicketView> {
    return this.tickets.create(user.tenantId, user.id, dto);
  }

  @Post(':id/messages')
  addMessage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateSupportTicketMessageSchema))
    dto: CreateSupportTicketMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SupportTicketView> {
    return this.tickets.addMessage(id, user.tenantId, user.id, dto);
  }
}

@UseGuards(PlatformAdminGuard)
@Controller('platform-admin/support-tickets')
export class PlatformAdminSupportTicketsController {
  constructor(private readonly tickets: SupportTicketsAdminService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(AdminListSupportTicketsQuerySchema))
    query: AdminListSupportTicketsQueryDto,
  ): Promise<AdminSupportTicketView[]> {
    return this.tickets.listAll(query);
  }

  @Patch(':id')
  updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminUpdateSupportTicketStatusSchema))
    dto: AdminUpdateSupportTicketStatusDto,
  ): Promise<AdminSupportTicketView> {
    return this.tickets.updateStatus(id, dto);
  }

  @Post(':id/messages')
  addMessage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateSupportTicketMessageSchema))
    dto: CreateSupportTicketMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AdminSupportTicketView> {
    return this.tickets.addMessage(id, user.id, dto);
  }
}
