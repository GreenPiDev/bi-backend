import { z } from 'zod';

export const ChatHistoryItem = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(2000),
});
export type ChatHistoryItem = z.infer<typeof ChatHistoryItem>;

/**
 * `history` artik client'tan gelmiyor (bkz. docs/VARSAYIMLAR.md V77) - konusma
 * gecmisi `ChatConversation`/`ChatMessage` tablolarinda kalici tutuluyor,
 * `ChatbotService.chat` onceki mesajlari `conversationId`'den kendi yukluyor.
 */
export const ChatRequest = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1).max(2000),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const ChatResponse = z.object({
  reply: z.string(),
  navigateTo: z.string().nullable(),
  /** Bu, konusmanin ilk mesajiysa yeni atanan baslik - liste ekranini yeniden
   * sorgulamadan guncelleyebilmek icin. Baslik zaten varsa null. */
  title: z.string().nullable(),
});
export type ChatResponse = z.infer<typeof ChatResponse>;
