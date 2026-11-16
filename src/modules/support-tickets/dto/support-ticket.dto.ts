import { z } from 'zod';

export const SupportTicketKindSchema = z.enum(['PROBLEM', 'SUGGESTION']);
export const SupportTicketStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
]);

export const CreateSupportTicketSchema = z.object({
  kind: SupportTicketKindSchema,
  message: z.string().trim().min(1, 'Mesaj metni gerekli.').max(5000),
});
export type CreateSupportTicketDto = z.infer<typeof CreateSupportTicketSchema>;

/** Yazismaya yeni mesaj (hem tenant hem super admin tarafi ayni sema). */
export const CreateSupportTicketMessageSchema = z.object({
  body: z.string().trim().min(1, 'Mesaj metni gerekli.').max(5000),
});
export type CreateSupportTicketMessageDto = z.infer<
  typeof CreateSupportTicketMessageSchema
>;

export const AdminUpdateSupportTicketStatusSchema = z.object({
  status: SupportTicketStatusSchema,
});
export type AdminUpdateSupportTicketStatusDto = z.infer<
  typeof AdminUpdateSupportTicketStatusSchema
>;

export const AdminListSupportTicketsQuerySchema = z.object({
  status: SupportTicketStatusSchema.optional(),
  kind: SupportTicketKindSchema.optional(),
});
export type AdminListSupportTicketsQueryDto = z.infer<
  typeof AdminListSupportTicketsQuerySchema
>;
