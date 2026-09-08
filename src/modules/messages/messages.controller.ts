import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateMessageSchema,
  MessageQuerySchema,
  type CreateMessageDto,
  type MessageQueryDto,
} from './dto/message.dto';
import {
  MessagesService,
  type ConversationDetail,
  type ConversationSummary,
  type MessageWithRecipients,
} from './messages.service';

@ModulePage('messages')
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @RequiresPermission('messages', 'VIEW')
  list(
    @Query(new ZodValidationPipe(MessageQuerySchema)) query: MessageQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PagedResult<ConversationSummary>> {
    return this.messages.list(user.id, query);
  }

  @Get('assignable-users')
  @RequiresPermission('messages', 'VIEW')
  listAssignableUsers(): Promise<{ id: string; name: string }[]> {
    return this.messages.listAssignableUsers();
  }

  @Get(':conversationId')
  @RequiresPermission('messages', 'VIEW')
  getById(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ConversationDetail> {
    return this.messages.getById(conversationId, user.id);
  }

  @Post()
  @RequiresPermission('messages', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateMessageSchema)) dto: CreateMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MessageWithRecipients> {
    return this.messages.create(user.tenantId, user.id, dto);
  }

  @Patch(':conversationId/read')
  @RequiresPermission('messages', 'VIEW')
  markRead(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.messages.markConversationRead(conversationId, user.id);
  }
}
