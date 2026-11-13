import { moveSideEffects } from './kanban-card-rules';

const USER = '11111111-1111-4111-8111-111111111111';
const NONE = { cardData: {}, revisionNote: null, progressNote: null };

describe('moveSideEffects', () => {
  it('requires a revision note when pulling a card back from IN_REVIEW to IN_PROGRESS', () => {
    expect(() =>
      moveSideEffects(
        { column: 'IN_REVIEW' },
        { column: 'IN_PROGRESS', index: 0 },
        USER,
      ),
    ).toThrow(
      expect.objectContaining({ code: 'KANBAN_REVISION_NOTE_REQUIRED' }),
    );
  });

  it('returns the revision note to append to history, without touching the card', () => {
    expect(
      moveSideEffects(
        { column: 'IN_REVIEW' },
        {
          column: 'IN_PROGRESS',
          index: 0,
          revisionNote: 'Renkler duzeltilsin',
        },
        USER,
      ),
    ).toEqual({ ...NONE, revisionNote: 'Renkler duzeltilsin' });
  });

  it('returns an optional progress note when sending a card to review', () => {
    expect(
      moveSideEffects(
        { column: 'IN_PROGRESS' },
        { column: 'IN_REVIEW', index: 0, progressNote: 'Taslak hazir' },
        USER,
      ),
    ).toEqual({ ...NONE, progressNote: 'Taslak hazir' });
  });

  it('allows sending to review without a progress note (empty is ignored)', () => {
    expect(
      moveSideEffects(
        { column: 'IN_PROGRESS' },
        { column: 'IN_REVIEW', index: 0 },
        USER,
      ),
    ).toEqual(NONE);
    expect(
      moveSideEffects(
        { column: 'IN_PROGRESS' },
        { column: 'IN_REVIEW', index: 0, progressNote: '' },
        USER,
      ),
    ).toEqual(NONE);
  });

  it('ignores notes on unrelated moves', () => {
    expect(
      moveSideEffects(
        { column: 'TODO' },
        { column: 'IN_REVIEW', index: 0, progressNote: 'x', revisionNote: 'y' },
        USER,
      ),
    ).toEqual(NONE);
    expect(
      moveSideEffects(
        { column: 'IN_REVIEW' },
        { column: 'TODO', index: 0 },
        USER,
      ),
    ).toEqual(NONE);
  });

  it('stamps completion when moving to DONE', () => {
    const result = moveSideEffects(
      { column: 'IN_REVIEW' },
      { column: 'DONE', index: 0 },
      USER,
    );
    expect(result.revisionNote).toBeNull();
    expect(result.progressNote).toBeNull();
    expect(result.cardData).toMatchObject({ completedById: USER });
    expect(result.cardData.completedAt).toBeInstanceOf(Date);
  });
});
