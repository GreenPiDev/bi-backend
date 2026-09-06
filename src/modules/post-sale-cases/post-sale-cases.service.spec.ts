import { AppException } from '../../core/errors/app.exception';
import { PostSaleCasesService } from './post-sale-cases.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const surveyQueueAdd = vi.fn();
const fakeSurveyQueue = { add: surveyQueueAdd } as never;

function createCaseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'psc-1',
    quoteId: 'quote-1',
    accountId: 'account-1',
    contactId: null,
    reminderAt: new Date('2026-09-20T00:00:00.000Z'),
    reminderSentAt: null,
    feedbackReceivedAt: null,
    feedbackNote: null,
    quote: { id: 'quote-1', quoteNumber: 'TEK-2026-09-06-001' },
    account: { id: 'account-1', name: 'ACME' },
    contact: null,
    feedbackSurvey: null,
    ...overrides,
  };
}

function createPrisma(row: unknown = createCaseRow()) {
  return {
    postSaleCase: {
      findMany: vi.fn().mockResolvedValue(row ? [row] : []),
      count: vi.fn().mockResolvedValue(row ? 1 : 0),
      findFirst: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
    },
    contact: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'contact-1', accountId: 'account-1' }),
    },
    feedbackSurvey: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('PostSaleCasesService', () => {
  beforeEach(() => {
    auditLog.mockClear();
    surveyQueueAdd.mockClear();
  });

  it('getById: bulunamayan kayit icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new PostSaleCasesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('getById: hatirlatma da geri bildirim de yoksa BEKLEMEDE doner', async () => {
    const prisma = createPrisma(createCaseRow());
    const service = new PostSaleCasesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    const result = await service.getById('psc-1');
    expect(result.status).toBe('BEKLEMEDE');
  });

  it('getById: reminderSentAt varsa HATIRLATILDI doner', async () => {
    const prisma = createPrisma(createCaseRow({ reminderSentAt: new Date() }));
    const service = new PostSaleCasesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    const result = await service.getById('psc-1');
    expect(result.status).toBe('HATIRLATILDI');
  });

  it('getById: feedbackReceivedAt varsa GERI_BILDIRIM_ALINDI doner (reminderSentAt da olsa)', async () => {
    const prisma = createPrisma(
      createCaseRow({
        reminderSentAt: new Date(),
        feedbackReceivedAt: new Date(),
      }),
    );
    const service = new PostSaleCasesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    const result = await service.getById('psc-1');
    expect(result.status).toBe('GERI_BILDIRIM_ALINDI');
  });

  it('sendSurvey: contactId hic verilmemisse CONTACT_REQUIRED firlatir', async () => {
    const prisma = createPrisma(createCaseRow({ contactId: null }));
    const service = new PostSaleCasesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await expect(service.sendSurvey('psc-1', {})).rejects.toMatchObject({
      code: 'CONTACT_REQUIRED',
    });
  });

  it('sendSurvey: verilen contactId baska bir firmaya aitse CONTACT_ACCOUNT_MISMATCH firlatir', async () => {
    const prisma = createPrisma(createCaseRow({ contactId: null }));
    prisma.contact.findFirst.mockResolvedValue({
      id: 'contact-2',
      accountId: 'baska-firma',
    });
    const service = new PostSaleCasesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await expect(
      service.sendSurvey('psc-1', { contactId: 'contact-2' }),
    ).rejects.toMatchObject({ code: 'CONTACT_ACCOUNT_MISMATCH' });
  });

  it('sendSurvey: gecerli contactId verilince case guncellenir ve anket kuyruguna eklenir', async () => {
    const prisma = createPrisma(createCaseRow({ contactId: null }));
    const service = new PostSaleCasesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.sendSurvey('psc-1', { contactId: 'contact-1' });

    expect(prisma.postSaleCase.update).toHaveBeenCalledWith({
      where: { id: 'psc-1' },
      data: { contactId: 'contact-1' },
    });
    expect(surveyQueueAdd).toHaveBeenCalledWith('send-post-sale-survey', {
      postSaleCaseId: 'psc-1',
    });
  });

  it('sendSurvey: case zaten contactId tasiyorsa resend sayilir, tekrar dogrulama yapmaz', async () => {
    const prisma = createPrisma(createCaseRow({ contactId: 'contact-1' }));
    const service = new PostSaleCasesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.sendSurvey('psc-1', {});

    expect(prisma.contact.findFirst).not.toHaveBeenCalled();
    expect(prisma.postSaleCase.update).not.toHaveBeenCalled();
    expect(surveyQueueAdd).toHaveBeenCalledWith('send-post-sale-survey', {
      postSaleCaseId: 'psc-1',
    });
  });

  it('markFeedback: feedbackReceivedAt setler ve iliskili FeedbackSurvey varsa gunceller', async () => {
    const prisma = createPrisma(
      createCaseRow({
        feedbackSurvey: { id: 'survey-1', responseNote: null },
      }),
    );
    const service = new PostSaleCasesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.markFeedback('psc-1', { responseNote: 'Musteri memnun' });

    expect(prisma.postSaleCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'psc-1' },
        data: expect.objectContaining({ feedbackNote: 'Musteri memnun' }),
      }),
    );
    expect(prisma.feedbackSurvey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'survey-1' },
        data: expect.objectContaining({ responseNote: 'Musteri memnun' }),
      }),
    );
  });

  it('markFeedback: iliskili FeedbackSurvey yoksa sadece case guncellenir', async () => {
    const prisma = createPrisma(createCaseRow({ feedbackSurvey: null }));
    const service = new PostSaleCasesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.markFeedback('psc-1', {});

    expect(prisma.postSaleCase.update).toHaveBeenCalled();
    expect(prisma.feedbackSurvey.update).not.toHaveBeenCalled();
  });
});
