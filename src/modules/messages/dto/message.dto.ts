import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const MessageRelatedEntitySchema = z.enum([
  'PROJECT',
  'QUOTE',
  'INTERACTION',
]);

export const CreateMessageSchema = z
  .object({
    subject: z.string().trim().max(200).optional(),
    body: z.string().trim().min(1, 'Mesaj metni bos birakilamaz.'),
    toUserIds: z
      .array(z.string().uuid())
      .min(1, 'En az bir alici secilmelidir.'),
    ccUserIds: z.array(z.string().uuid()).max(50).default([]),
    relatedEntity: MessageRelatedEntitySchema.optional(),
    relatedEntityId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
  })
  .refine(
    (dto) => Boolean(dto.relatedEntity) === Boolean(dto.relatedEntityId),
    {
      message:
        'relatedEntity ve relatedEntityId birlikte verilmeli ya da ikisi de bos olmalidir.',
      path: ['relatedEntity'],
    },
  )
  .refine((dto) => Boolean(dto.conversationId) || Boolean(dto.subject), {
    // Yaniti mevcut konusmaya bagliyorsak konu ilk mesajdan miras alinir
    // (bkz. messages.service.ts create()), sadece yeni konusma baslatirken zorunlu.
    message: 'Konu gereklidir.',
    path: ['subject'],
  });
export type CreateMessageDto = z.infer<typeof CreateMessageSchema>;

export const MessageQuerySchema = ListQuerySchema.extend({
  box: z.enum(['inbox', 'sent']).optional(),
  relatedEntity: MessageRelatedEntitySchema.optional(),
  relatedEntityId: z.string().uuid().optional(),
});
export type MessageQueryDto = z.infer<typeof MessageQuerySchema>;
