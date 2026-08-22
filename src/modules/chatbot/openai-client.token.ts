import type OpenAI from 'openai';

export const OPENAI_CLIENT = Symbol('OPENAI_CLIENT');

/**
 * Servisin fiilen kullandigi yuzeyle sinirli - tam `OpenAI` sinifinin
 * (private alanlar dahil) her uyesini taklit etmeye gerek kalmadan testte
 * mock'lanabilsin diye.
 */
export interface OpenAiClient {
  chat: {
    completions: {
      create: OpenAI['chat']['completions']['create'];
    };
  };
}
