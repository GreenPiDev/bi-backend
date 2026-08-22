import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { ChatbotThrottlerGuard } from './chatbot-throttler.guard';
import { ChatbotService } from './chatbot.service';
import { ChatRequest, type ChatResponse } from './dto/chat-message.dto';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbot: ChatbotService) {}

  @Post('message')
  @UseGuards(ChatbotThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  sendMessage(
    @Body(new ZodValidationPipe(ChatRequest)) dto: ChatRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<ChatResponse> {
    return this.chatbot.chat(dto, user);
  }
}
