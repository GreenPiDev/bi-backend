import { z } from 'zod';
import {
  arrayQueryParam,
  ListQuerySchema,
} from '../../../core/dto/list-query.dto';

export const MessageRelatedEntitySchema = z.enum([
  'PROJECT',
  'QUOTE',
  'INTERACTION',
]);

// POST /messages/attachments'in donusune birebir eslenir - mesaj olusturulmadan once
// yuklenip anahtari burada referans verilir (bkz. messages.controller.ts, MessagesService.create).
export const MessageAttachmentRefSchema = z.object({
  fileKey: z.string().min(1),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});
export type MessageAttachmentRefDto = z.infer<
  typeof MessageAttachmentRefSchema
>;

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
    attachments: z
      .array(MessageAttachmentRefSchema)
      .max(5, 'En fazla 5 dosya eklenebilir.')
      .optional(),
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

export const SetConversationReadSchema = z.object({
  read: z.boolean().default(true),
});
export type SetConversationReadDto = z.infer<typeof SetConversationReadSchema>;

export const SetConversationStarSchema = z.object({
  starred: z.boolean(),
});
export type SetConversationStarDto = z.infer<typeof SetConversationStarSchema>;

export const MessageQuerySchema = ListQuerySchema.extend({
  box: z.enum(['inbox', 'sent']).optional(),
  // Ilgili kayit turu (F: kompozit filtre) coklu secilebilir; belirli kayitlar
  // (quoteIds/projectIds/interactionIds) secilirse o tur icin turu genel gecerli
  // saymak yerine sadece o kayitlarla sinirlanir - bkz. messages.service.ts list().
  relatedEntity: arrayQueryParam(MessageRelatedEntitySchema),
  quoteIds: arrayQueryParam(z.string().uuid()),
  projectIds: arrayQueryParam(z.string().uuid()),
  interactionIds: arrayQueryParam(z.string().uuid()),
  recipientUserId: z.string().uuid().optional(),
});
export type MessageQueryDto = z.infer<typeof MessageQuerySchema>;
