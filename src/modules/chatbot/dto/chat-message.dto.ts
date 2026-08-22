import { z } from 'zod';

export const ChatHistoryItem = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(2000),
});
export type ChatHistoryItem = z.infer<typeof ChatHistoryItem>;

export const ChatRequest = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(ChatHistoryItem).max(20).default([]),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const ChatResponse = z.object({
  reply: z.string(),
  navigateTo: z.string().nullable(),
});
export type ChatResponse = z.infer<typeof ChatResponse>;
