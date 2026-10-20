import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { SurveysService } from './surveys.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

function createSurveyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'survey-1',
    tenantId: 't1',
    name: 'Memnuniyet Anketi',
    description: null,
    isActive: true,
    createdById: 'u1',
    questions: [],
    ...overrides,
  };
}

function createPrisma(row: unknown = createSurveyRow()) {
  const prisma = {
    survey: {
      findMany: vi.fn().mockResolvedValue(row ? [row] : []),
      count: vi.fn().mockResolvedValue(row ? 1 : 0),
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
      delete: vi.fn().mockResolvedValue(row),
    },
    surveyQuestion: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

function createService(prisma: ReturnType<typeof createPrisma>) {
  return new SurveysService(prisma as never, fakeAudit);
}

describe('SurveysService', () => {
  beforeEach(() => {
    auditLog.mockClear();
  });

  it('getById: bulunamayan anket icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = createService(prisma);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('listActive: sadece isActive=true anketleri getirir', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);
    await service.listActive();

    expect(prisma.survey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('create: MULTIPLE_CHOICE sorusunda secenekler nested create ile yazilir', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);

    await runInTenant(() =>
      service.create('u1', {
        name: 'Yeni Anket',
        isActive: true,
        questions: [
          {
            type: 'MULTIPLE_CHOICE',
            text: 'Memnun musunuz?',
            required: true,
            options: [{ label: 'Evet' }, { label: 'Hayir' }],
          },
          { type: 'OPEN_ENDED', text: 'Yorumunuz?', required: false },
        ],
      }),
    );

    expect(prisma.survey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          name: 'Yeni Anket',
          createdById: 'u1',
          questions: {
            create: [
              expect.objectContaining({
                type: 'MULTIPLE_CHOICE',
                options: {
                  create: [
                    { label: 'Evet', ordinal: 0 },
                    { label: 'Hayir', ordinal: 1 },
                  ],
                },
              }),
              expect.objectContaining({
                type: 'OPEN_ENDED',
                options: undefined,
              }),
            ],
          },
        }),
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entity: 'Survey' }),
    );
  });

  it('update: questions verilince eski sorulari silip yenilerini tek tek olusturur', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);

    await service.update('survey-1', {
      questions: [
        { type: 'LIKERT', text: 'Ne kadar memnunsunuz?', required: true },
      ],
    });

    expect(prisma.surveyQuestion.deleteMany).toHaveBeenCalledWith({
      where: { surveyId: 'survey-1' },
    });
    expect(prisma.surveyQuestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          surveyId: 'survey-1',
          type: 'LIKERT',
          ordinal: 0,
          options: undefined,
        }),
      }),
    );
  });

  it('update: questions verilmezse mevcut sorular dokunulmaz', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);

    await service.update('survey-1', { name: 'Guncel Ad' });

    expect(prisma.surveyQuestion.deleteMany).not.toHaveBeenCalled();
  });

  it('remove: var olan anketi siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);

    await service.remove('survey-1');

    expect(prisma.survey.delete).toHaveBeenCalledWith({
      where: { id: 'survey-1' },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE', entity: 'Survey' }),
    );
  });
});
