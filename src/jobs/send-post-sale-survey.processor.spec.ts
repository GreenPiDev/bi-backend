import { SendPostSaleSurveyProcessor } from './send-post-sale-survey.processor';

const fakePostSaleCasesCache = { invalidateForTenant: vi.fn() } as never;
const fakeConfig = {
  getOrThrow: vi.fn().mockReturnValue('http://localhost:5173'),
} as never;

function createCase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'psc-1',
    tenantId: 'tenant-1',
    salesOrder: { orderNumber: 'SAT-2026-10-19-001' },
    quote: { quoteNumber: 'TEK-2026-09-06-001' },
    tenant: { name: 'ACME', email: 'destek@acme.com' },
    ...overrides,
  };
}

function createPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    postSaleCase: {
      findUnique: vi.fn().mockResolvedValue(createCase()),
    },
    feedbackSurvey: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

function createJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: {
      postSaleCaseId: 'psc-1',
      surveyId: 'survey-1',
      recipientKind: 'CONTACT',
      contactId: 'contact-1',
      recipientName: 'Ayse Yilmaz',
      recipientEmail: 'ayse@example.com',
      fromEmail: null,
      ...overrides,
    },
  } as never;
}

describe('SendPostSaleSurveyProcessor', () => {
  it('aliciya anket linkini iceren e-posta gonderir ve FeedbackSurvey.sentAt olusturur', async () => {
    const prisma = createPrisma();
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendPostSaleSurveyProcessor(
      prisma as never,
      mail as never,
      fakePostSaleCasesCache,
      fakeConfig,
    );
    await processor.process(createJob());

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['ayse@example.com'],
        text: expect.stringContaining('http://localhost:5173/anket/'),
        fromName: 'ACME',
        replyTo: 'destek@acme.com',
      }),
    );
    expect(prisma.feedbackSurvey.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postSaleCaseId: 'psc-1' },
        create: expect.objectContaining({
          postSaleCaseId: 'psc-1',
          surveyId: 'survey-1',
          recipientKind: 'CONTACT',
          contactId: 'contact-1',
          recipientName: 'Ayse Yilmaz',
          recipientEmail: 'ayse@example.com',
          responseToken: expect.any(String),
        }),
      }),
    );
  });

  it('case bulunamazsa gondermez', async () => {
    const prisma = createPrisma();
    prisma.postSaleCase.findUnique = vi.fn().mockResolvedValue(null);
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendPostSaleSurveyProcessor(
      prisma as never,
      mail as never,
      fakePostSaleCasesCache,
      fakeConfig,
    );
    await processor.process(createJob());

    expect(mail.send).not.toHaveBeenCalled();
  });

  it('EMAIL modunda contactId null kalir, mail yine gider', async () => {
    const prisma = createPrisma();
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendPostSaleSurveyProcessor(
      prisma as never,
      mail as never,
      fakePostSaleCasesCache,
      fakeConfig,
    );
    await processor.process(
      createJob({
        recipientKind: 'EMAIL',
        contactId: null,
        recipientEmail: 'elle@example.com',
      }),
    );

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['elle@example.com'] }),
    );
    expect(prisma.feedbackSurvey.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recipientKind: 'EMAIL',
          contactId: null,
        }),
      }),
    );
  });

  it('fromEmail verilince tenant.email yerine onu kullanir', async () => {
    const prisma = createPrisma();
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendPostSaleSurveyProcessor(
      prisma as never,
      mail as never,
      fakePostSaleCasesCache,
      fakeConfig,
    );
    await processor.process(createJob({ fromEmail: 'ozel@acme.com' }));

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ fromName: 'ACME', replyTo: 'ozel@acme.com' }),
    );
  });

  it('tenant.email bos ise replyTo undefined kalir', async () => {
    const prisma = createPrisma();
    prisma.postSaleCase.findUnique = vi
      .fn()
      .mockResolvedValue(createCase({ tenant: { name: 'ACME', email: null } }));
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendPostSaleSurveyProcessor(
      prisma as never,
      mail as never,
      fakePostSaleCasesCache,
      fakeConfig,
    );
    await processor.process(createJob());

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ fromName: 'ACME', replyTo: undefined }),
    );
  });

  it('teklifsiz (manuel) siparis icin siparis numarasini kullanir', async () => {
    const prisma = createPrisma();
    prisma.postSaleCase.findUnique = vi
      .fn()
      .mockResolvedValue(createCase({ quote: null }));
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendPostSaleSurveyProcessor(
      prisma as never,
      mail as never,
      fakePostSaleCasesCache,
      fakeConfig,
    );
    await processor.process(createJob());

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('SAT-2026-10-19-001'),
      }),
    );
  });

  it('resend: mevcut anket kaydinin responseToken/sentAt degerini gunceller, respondedAt sifirlanir', async () => {
    const prisma = createPrisma();
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendPostSaleSurveyProcessor(
      prisma as never,
      mail as never,
      fakePostSaleCasesCache,
      fakeConfig,
    );
    await processor.process(createJob());

    expect(prisma.feedbackSurvey.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sentAt: expect.any(Date),
          responseToken: expect.any(String),
          respondedAt: null,
        }),
      }),
    );
  });
});
