import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

/** /profile?tab=notifications icin tam liste, page/pageSize disinda ozel bir
 * filtre yok - q/sort ListQuerySchema'dan miras alinir ama bu ucta kullanilmaz. */
export const NotificationQuerySchema = ListQuerySchema.pick({
  page: true,
  pageSize: true,
});
export type NotificationQueryDto = z.infer<typeof NotificationQuerySchema>;

export const SetNotificationReadSchema = z.object({
  read: z.boolean().default(true),
});
export type SetNotificationReadDto = z.infer<typeof SetNotificationReadSchema>;
