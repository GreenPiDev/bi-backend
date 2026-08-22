import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { QueryModule } from '../query/query.module';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { OPENAI_CLIENT } from './openai-client.token';

@Module({
  imports: [ConfigModule, QueryModule],
  controllers: [ChatbotController],
  providers: [
    ChatbotService,
    {
      provide: OPENAI_CLIENT,
      // baseURL verilirse (ör. Gemini'nin OpenAI-uyumlu ucu) farkli bir
      // saglayiciya karsi ayni OpenAI SDK'si kullanilir - bkz. .env.example
      // ve docs/VARSAYIMLAR.md V14.
      useFactory: (config: ConfigService) =>
        new OpenAI({
          apiKey: config.getOrThrow<string>('OPENAI_API_KEY'),
          baseURL: config.get<string>('OPENAI_BASE_URL'),
        }),
      inject: [ConfigService],
    },
  ],
})
export class ChatbotModule {}
