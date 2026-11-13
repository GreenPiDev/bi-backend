import type { KanbanCard, KanbanColumn, KanbanPriority } from '@prisma/client';
import type { FileUrlService } from '../../core/storage/file-url.service';
import type { KanbanTenantRef } from './kanban-boards.service';

export interface KanbanAssignee {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** true: atanan kisi ortak (diger) tenant'in kullanicisi. */
  isExternal: boolean;
}

export interface KanbanCardNoteView {
  id: string;
  note: string;
  /** null = notu yazan kullanici silinmis. */
  authorName: string | null;
  createdAt: Date;
}

export interface KanbanCardView {
  id: string;
  title: string;
  description: string | null;
  column: KanbanColumn;
  position: number;
  priority: KanbanPriority;
  dueDate: string | null;
  /** null = karta kimse atanmamis. */
  assignee: KanbanAssignee | null;
  completedAt: Date | null;
  /** Son revize notu (Incelemede -> Devam Ediyor geri cekilisinde alinir). */
  /** Revize gecmisi, en yeni once (Devam Ediyor kartinda revisions[0] gosterilir). */
  revisions: KanbanCardNoteView[];
  /** Ilerleme notlari, en yeni once (Incelemede kartinda progressNotes[0] gosterilir). */
  progressNotes: KanbanCardNoteView[];
  createdAt: Date;
}

export interface KanbanBoardDetail {
  id: string;
  name: string;
  isOwner: boolean;
  ownerTenant: KanbanTenantRef;
  partnerTenant: KanbanTenantRef | null;
  cards: KanbanCardView[];
}

export const ASSIGNEE_SELECT = {
  select: {
    id: true,
    name: true,
    tenantId: true,
    avatarKey: true,
    updatedAt: true,
  },
} as const;

const NOTE_INCLUDE = {
  orderBy: { createdAt: 'desc' },
  include: { createdBy: { select: { name: true } } },
} as const;

type NoteRow = {
  id: string;
  note: string;
  createdAt: Date;
  createdBy: { name: string } | null;
};

const toNoteViews = (rows: NoteRow[] | undefined): KanbanCardNoteView[] =>
  (rows ?? []).map((row) => ({
    id: row.id,
    note: row.note,
    authorName: row.createdBy?.name ?? null,
    createdAt: row.createdAt,
  }));

export const CARD_INCLUDE = {
  assignee: ASSIGNEE_SELECT,
  revisions: NOTE_INCLUDE,
  progressNotes: NOTE_INCLUDE,
} as const;

export type CardWithAssignee = KanbanCard & {
  assignee: {
    id: string;
    name: string;
    tenantId: string;
    avatarKey: string | null;
    updatedAt: Date;
  } | null;
  revisions?: NoteRow[];
  progressNotes?: NoteRow[];
};

function toAssignee(
  assignee: NonNullable<CardWithAssignee['assignee']>,
  tenantId: string,
  fileUrl: FileUrlService,
): KanbanAssignee {
  const isExternal = assignee.tenantId !== tenantId;
  return {
    id: assignee.id,
    name: assignee.name,
    // /files proxy'si anahtari istek yapanin tenant'ina kilitler - ortak
    // tenant'in kullanicisinin avatari bu yuzden gosterilemez (bas harf).
    avatarUrl: isExternal
      ? null
      : fileUrl.build(assignee.avatarKey, assignee.updatedAt),
    isExternal,
  };
}

export const toDateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

export const fromDateOnly = (value: string | null | undefined): Date | null =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

export function toKanbanCardView(
  card: CardWithAssignee,
  tenantId: string,
  fileUrl: FileUrlService,
): KanbanCardView {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    column: card.column,
    position: card.position,
    priority: card.priority,
    dueDate: toDateOnly(card.dueDate),
    assignee: card.assignee
      ? toAssignee(card.assignee, tenantId, fileUrl)
      : null,
    completedAt: card.completedAt,
    revisions: toNoteViews(card.revisions),
    progressNotes: toNoteViews(card.progressNotes),
    createdAt: card.createdAt,
  };
}
