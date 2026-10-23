import { z } from 'zod';

export const NoteColorSchema = z.enum([
  'YELLOW',
  'BLUE',
  'RED',
  'GREEN',
  'PURPLE',
]);

const ReminderSchema = z.object({
  startAt: z.string().min(1, 'Hatirlatma tarihi gerekli.'),
  title: z.string().trim().min(1, 'Hatirlatma basligi gerekli.').max(200),
  description: z.string().trim().max(2000).optional(),
});

export const CreateNoteSchema = z.object({
  content: z.string().trim().min(1, 'Not metni gerekli.').max(5000),
  color: NoteColorSchema.default('YELLOW'),
  /** Varsayilan true: not sadece olusturana gorunur (bkz. docs/VARSAYIMLAR.md V73). */
  isPrivate: z.boolean().default(true),
  reminder: ReminderSchema.optional(),
});
export type CreateNoteDto = z.infer<typeof CreateNoteSchema>;

export const UpdateNoteSchema = z.object({
  content: z.string().trim().min(1, 'Not metni gerekli.').max(5000).optional(),
  color: NoteColorSchema.optional(),
  isPrivate: z.boolean().optional(),
  /**
   * undefined = hatirlatmaya dokunma, null = mevcut hatirlatmayi kaldir,
   * obje = olustur/guncelle (NotesService.update'teki 'reminder' in dto kontrolu).
   */
  reminder: ReminderSchema.nullable().optional(),
});
export type UpdateNoteDto = z.infer<typeof UpdateNoteSchema>;
