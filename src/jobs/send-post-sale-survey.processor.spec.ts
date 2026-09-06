import { SendPostSaleSurveyProcessor } from './send-post-sale-survey.processor';

function createCase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'psc-1',
    tenantId: 'tenant-1',
    quote: { quoteNumber: 'TEK-2026-09-06-001' },
    contact: {
      id: 'contact-1',
      firstName: 'Ayse',
      lastName: 'Yilmaz',
      email: 'ayse@example.com',
    },
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

function createJob(postSaleCaseId = 'psc-1') {
  return { data: { postSaleCaseId } } as never;
}

describe('SendPostSaleSurveyProcessor', () => {
  it('kisiye e-posta gonderir ve FeedbackSurvey.sentAt olusturur', async () => {
    const prisma = createPrisma();
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendPostSaleSurveyProcessor(
      prisma as never,
      mail as never,
    );
    await processor.process(createJob());

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['ayse@example.com'] }),
    );
    expect(prisma.feedbackSurvey.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postSaleCaseId: 'psc-1' },
        create: expect.objectContaining({
          postSaleCaseId: 'psc-1',
          contactId: 'contact-1',
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
    );
    await processor.process(createJob());

    expect(mail.send).not.toHaveBeenCalled();
  });

  it('kisinin e-postasi yoksa gondermez', async () => {
    const prisma = createPrisma();
    prisma.postSaleCase.findUnique = vi
      .fn()
      .mockResolvedValue(
        createCase({ contact: { id: 'contact-1', email: null } }),
      );
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendPostSaleSurveyProcessor(
      prisma as never,
      mail as never,
    );
    await processor.process(createJob());

    expect(mail.send).not.toHaveBeenCalled();
  });

  it('resend: mevcut anket kaydinin sentAt degerini gunceller', async () => {
    const prisma = createPrisma();
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendPostSaleSurveyProcessor(
      prisma as never,
      mail as never,
    );
    await processor.process(createJob());

    expect(prisma.feedbackSurvey.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ sentAt: expect.any(Date) }),
      }),
    );
  });
});
