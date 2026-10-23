import { PublicSurveysService } from './public-surveys.service';

const fakeStorage = { download: vi.fn() } as never;

function createFeedbackSurvey(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'fs-1',
    tenantId: 't1',
    postSaleCaseId: 'psc-1',
    responseToken: 'token-123',
    respondedAt: null,
    tenant: { name: 'ACME', logoKey: null },
    survey: {
      name: 'Memnuniyet Anketi',
      description: 'Aciklama',
      questions: [
        {
          id: 'q-open',
          type: 'OPEN_ENDED',
          text: 'Yorumunuz?',
          required: false,
          options: [],
        },
        {
          id: 'q-likert',
          type: 'LIKERT',
          text: 'Ne kadar memnunsunuz?',
          required: true,
          options: [],
        },
        {
          id: 'q-mc',
          type: 'MULTIPLE_CHOICE',
          text: 'Teslimat zamaninda mi?',
          required: true,
          options: [
            { id: 'opt-1', label: 'Evet' },
            { id: 'opt-2', label: 'Hayir' },
          ],
        },
      ],
    },
    ...overrides,
  };
}

function createPrisma(feedbackSurvey: unknown = createFeedbackSurvey()) {
  const prisma = {
    feedbackSurvey: {
      findUnique: vi.fn().mockResolvedValue(feedbackSurvey),
      update: vi.fn().mockResolvedValue({}),
    },
    postSaleCase: {
      update: vi.fn().mockResolvedValue({}),
    },
    surveyResponse: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

describe('PublicSurveysService', () => {
  it('getByToken: token bulunamazsa TOKEN_NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new PublicSurveysService(prisma as never, fakeStorage);
    await expect(service.getByToken('yok')).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
    });
  });

  it('getByToken: gecerli token icin anket sablonunu (alreadyResponded=false) doner', async () => {
    const prisma = createPrisma();
    const service = new PublicSurveysService(prisma as never, fakeStorage);
    const result = await service.getByToken('token-123');

    expect(result.surveyName).toBe('Memnuniyet Anketi');
    expect(result.alreadyResponded).toBe(false);
    expect(result.questions).toHaveLength(3);
    expect(result.questions[2]?.options).toEqual([
      { id: 'opt-1', label: 'Evet' },
      { id: 'opt-2', label: 'Hayir' },
    ]);
  });

  it('getByToken: respondedAt doluysa alreadyResponded=true doner', async () => {
    const prisma = createPrisma(
      createFeedbackSurvey({ respondedAt: new Date() }),
    );
    const service = new PublicSurveysService(prisma as never, fakeStorage);
    const result = await service.getByToken('token-123');
    expect(result.alreadyResponded).toBe(true);
  });

  it('submit: token bulunamazsa TOKEN_NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new PublicSurveysService(prisma as never, fakeStorage);
    await expect(service.submit('yok', { answers: [] })).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
    });
  });

  it('submit: zaten yanitlanmissa ALREADY_RESPONDED firlatir', async () => {
    const prisma = createPrisma(
      createFeedbackSurvey({ respondedAt: new Date() }),
    );
    const service = new PublicSurveysService(prisma as never, fakeStorage);
    await expect(
      service.submit('token-123', { answers: [] }),
    ).rejects.toMatchObject({
      code: 'ALREADY_RESPONDED',
    });
  });

  it('submit: zorunlu soru cevaplanmamissa VALIDATION_ERROR firlatir', async () => {
    const prisma = createPrisma();
    const service = new PublicSurveysService(prisma as never, fakeStorage);
    await expect(
      service.submit('token-123', {
        answers: [{ questionId: 'q-mc', answerOptionId: 'opt-1' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it("submit: MULTIPLE_CHOICE sorusunda sablonda olmayan bir secenek ID'si verilince VALIDATION_ERROR firlatir", async () => {
    const prisma = createPrisma();
    const service = new PublicSurveysService(prisma as never, fakeStorage);
    await expect(
      service.submit('token-123', {
        answers: [
          { questionId: 'q-likert', answerLikertValue: 5 },
          { questionId: 'q-mc', answerOptionId: 'baska-anket-secenegi' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('submit: gecerli yanitlarla SurveyResponse olusturur ve respondedAt/feedbackReceivedAt setler', async () => {
    const prisma = createPrisma();
    const service = new PublicSurveysService(prisma as never, fakeStorage);

    await service.submit('token-123', {
      answers: [
        { questionId: 'q-open', answerText: 'Her sey harikaydi' },
        { questionId: 'q-likert', answerLikertValue: 5 },
        { questionId: 'q-mc', answerOptionId: 'opt-1' },
      ],
    });

    expect(prisma.surveyResponse.create).toHaveBeenCalledTimes(3);
    expect(prisma.surveyResponse.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          feedbackSurveyId: 'fs-1',
          questionId: 'q-open',
          answerText: 'Her sey harikaydi',
        }),
      }),
    );
    expect(prisma.feedbackSurvey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'fs-1' },
        data: expect.objectContaining({ respondedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.postSaleCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'psc-1' },
        data: expect.objectContaining({ feedbackReceivedAt: expect.any(Date) }),
      }),
    );
  });

  it('submit: opsiyonel soru bos birakilirsa SurveyResponse olusturulmaz', async () => {
    const prisma = createPrisma();
    const service = new PublicSurveysService(prisma as never, fakeStorage);

    await service.submit('token-123', {
      answers: [
        { questionId: 'q-likert', answerLikertValue: 3 },
        { questionId: 'q-mc', answerOptionId: 'opt-2' },
      ],
    });

    expect(prisma.surveyResponse.create).toHaveBeenCalledTimes(2);
  });
});
