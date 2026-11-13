import { z } from 'zod';

export const KANBAN_COLUMNS = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
] as const;
export const KanbanColumnSchema = z.enum(KANBAN_COLUMNS);
export const KanbanPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Gecersiz tarih.');

export const CreateKanbanBoardSchema = z.object({
  name: z.string().trim().min(1, 'Pano adi gerekli.').max(120),
  /** Doluysa pano bu tenant'la ortak olur (bkz. schema.prisma KanbanBoard). */
  partnerTenantId: z.string().trim().uuid('Gecersiz sirket kodu.').optional(),
});
export type CreateKanbanBoardDto = z.infer<typeof CreateKanbanBoardSchema>;

export const UpdateKanbanBoardSchema = z.object({
  name: z.string().trim().min(1, 'Pano adi gerekli.').max(120).optional(),
  /** undefined = ortakliga dokunma, null = ortakligi kaldir, uuid = ortagi ayarla/degistir. */
  partnerTenantId: z
    .string()
    .trim()
    .uuid('Gecersiz sirket kodu.')
    .nullable()
    .optional(),
});
export type UpdateKanbanBoardDto = z.infer<typeof UpdateKanbanBoardSchema>;

export const CreateKanbanCardSchema = z.object({
  title: z.string().trim().min(1, 'Is basligi gerekli.').max(200),
  description: z.string().trim().max(5000).optional(),
  /** Opsiyonel - verilmezse/null ise kart atanmamis olur. */
  assigneeUserId: z.string().uuid('Gecersiz kullanici.').nullable().optional(),
  priority: KanbanPrioritySchema.default('MEDIUM'),
  dueDate: DateOnlySchema.nullable().optional(),
});
export type CreateKanbanCardDto = z.infer<typeof CreateKanbanCardSchema>;

export const UpdateKanbanCardSchema = z.object({
  title: z.string().trim().min(1, 'Is basligi gerekli.').max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  /** undefined = dokunma, null = atamayi kaldir. */
  assigneeUserId: z.string().uuid('Gecersiz kullanici.').nullable().optional(),
  priority: KanbanPrioritySchema.optional(),
  dueDate: DateOnlySchema.nullable().optional(),
});
export type UpdateKanbanCardDto = z.infer<typeof UpdateKanbanCardSchema>;

export const MoveKanbanCardSchema = z.object({
  column: KanbanColumnSchema,
  /** Hedef kolondaki 0-tabanli sira; kolon uzunlugundan buyukse sona eklenir. */
  index: z.number().int().min(0),
  /** Incelemede -> Devam Ediyor tasimasinda zorunlu (bkz. kanban-card-rules.ts). */
  revisionNote: z.string().trim().min(1).max(2000).optional(),
  /** Devam Ediyor -> Incelemede tasimasinda OPSIYONEL ilerleme notu; bos ise yok sayilir. */
  progressNote: z.string().trim().max(2000).optional(),
});
export type MoveKanbanCardDto = z.infer<typeof MoveKanbanCardSchema>;
