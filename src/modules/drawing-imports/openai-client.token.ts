import type OpenAI from 'openai';

export const DRAWING_IMPORTS_OPENAI_CLIENT = Symbol(
  'DRAWING_IMPORTS_OPENAI_CLIENT',
);

/**
 * `chatbot/openai-client.token.ts` ile ayni desen - servisin fiilen kullandigi
 * yuzeyle sinirli bir arayuz, testte mock'lamak icin. Modul-ozgu kendi kopyasi
 * tutuluyor (chatbot modulune bagimlilik eklemek yerine) - CLAUDE.md'nin "her
 * modul kendi DTO/provider'ini tutar" ilkesiyle uyumlu.
 */
export interface OpenAiClient {
  chat: {
    completions: {
      create: OpenAI['chat']['completions']['create'];
    };
  };
}
