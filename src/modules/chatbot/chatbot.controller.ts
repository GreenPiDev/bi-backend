import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  ChatConversationsService,
  type ChatConversationDetail,
  type ChatConversationSummary,
} from './chat-conversations.service';
import { ChatbotThrottlerGuard } from './chatbot-throttler.guard';
import { ChatbotService } from './chatbot.service';
import { ChatRequest, type ChatResponse } from './dto/chat-message.dto';

@Controller('chatbot')
export class ChatbotController {
  constructor(
    private readonly chatbot: ChatbotService,
    private readonly conversations: ChatConversationsService,
  ) {}

  @Post('message')
  @UseGuards(ChatbotThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  sendMessage(
    @Body(new ZodValidationPipe(ChatRequest)) dto: ChatRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<ChatResponse> {
    return this.chatbot.chat(dto, user);
  }

  @Get('conversations')
  listConversations(
    @CurrentUser() user: RequestUser,
  ): Promise<ChatConversationSummary[]> {
    return this.conversations.list(user.id);
  }

  @Post('conversations')
  createConversation(
    @CurrentUser() user: RequestUser,
  ): Promise<ChatConversationSummary> {
    return this.conversations.create(user.id);
  }

  @Get('conversations/:id')
  getConversation(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ChatConversationDetail> {
    return this.conversations.getById(id, user.id);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  deleteConversation(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.conversations.remove(id, user.id);
  }
}
