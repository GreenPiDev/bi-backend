import { HttpStatus } from '@nestjs/common';
import type { KanbanCard, Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import type { MoveKanbanCardDto } from './dto/kanban.dto';

/** Kart Devam Ediyor'dan Incelemede'ye aliniyorsa (ilerleme bildirimi) true. */
export function isProgressMove(
  card: Pick<KanbanCard, 'column'>,
  dto: MoveKanbanCardDto,
): boolean {
  return card.column === 'IN_PROGRESS' && dto.column === 'IN_REVIEW';
}

/** Kart Incelemede'den Devam Ediyor'a geri cekiliyorsa (revize) true. */
export function isRevisionMove(
  card: Pick<KanbanCard, 'column'>,
  dto: MoveKanbanCardDto,
): boolean {
  return card.column === 'IN_REVIEW' && dto.column === 'IN_PROGRESS';
}

export interface MoveSideEffects {
  cardData: Prisma.KanbanCardUncheckedUpdateInput;
  /** Revize gecmisine (KanbanCardRevision) eklenecek not. */
  revisionNote: string | null;
  /** Ilerleme notlarina (KanbanCardProgressNote) eklenecek not. */
  progressNote: string | null;
}

/**
 * Tasinan kartin kolon/sira disindaki alanlari ve gecmise eklenecek notlar:
 * - DONE'a tasimada tamamlanma bilgisi.
 * - Revize (Incelemede -> Devam Ediyor): not ZORUNLU, yoksa tasima reddedilir
 *   (frontend modalindan bagimsiz, backend'de de zorunlu).
 * - Ilerleme (Devam Ediyor -> Incelemede): not OPSIYONEL, bossa eklenmez.
 * Notlar karta degil ayri gecmis tablolarina yeni satir olarak yazilir.
 */
export function moveSideEffects(
  card: Pick<KanbanCard, 'column'>,
  dto: MoveKanbanCardDto,
  userId: string,
): MoveSideEffects {
  const none: MoveSideEffects = {
    cardData: {},
    revisionNote: null,
    progressNote: null,
  };
  if (dto.column === 'DONE') {
    return {
      ...none,
      cardData: { completedAt: new Date(), completedById: userId },
    };
  }
  if (isRevisionMove(card, dto)) {
    if (!dto.revisionNote) {
      throw new AppException(
        'KANBAN_REVISION_NOTE_REQUIRED',
        'Karti incelemeden geri cekmek icin revize notu gerekli.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { ...none, revisionNote: dto.revisionNote };
  }
  if (isProgressMove(card, dto)) {
    return { ...none, progressNote: dto.progressNote || null };
  }
  return none;
}
