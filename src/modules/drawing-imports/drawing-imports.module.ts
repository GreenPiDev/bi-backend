import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DrawingsModule } from '../drawings/drawings.module';
import { AiLineMatcherService } from './ai-line-matcher.service';
import { DrawingImportsController } from './drawing-imports.controller';
import { DrawingImportsService } from './drawing-imports.service';
import { DRAWING_IMPORTS_OPENAI_CLIENT } from './openai-client.token';
import { PdfTextExtractorService } from './pdf-text-extractor.service';

@Module({
  imports: [ConfigModule, DrawingsModule],
  controllers: [DrawingImportsController],
  providers: [
    DrawingImportsService,
    AiLineMatcherService,
    PdfTextExtractorService,
    {
      provide: DRAWING_IMPORTS_OPENAI_CLIENT,
      // chatbot.module.ts ile ayni desen - bkz. docs/VARSAYIMLAR.md V14.
      useFactory: (config: ConfigService) =>
        new OpenAI({
          apiKey: config.getOrThrow<string>('OPENAI_API_KEY'),
          baseURL: config.get<string>('OPENAI_BASE_URL'),
        }),
      inject: [ConfigService],
    },
  ],
})
export class DrawingImportsModule {}
