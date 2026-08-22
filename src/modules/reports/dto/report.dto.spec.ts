import { CreateScheduledReportSchema } from './report.dto';

const DASHBOARD_ID = '11111111-1111-4111-8111-111111111111';

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    dashboardId: DASHBOARD_ID,
    cron: '0 8 * * 1',
    recipients: ['a@test.com'],
    ...overrides,
  };
}

describe('CreateScheduledReportSchema', () => {
  it('gecerli 5 alanli cron ifadesini kabul eder', () => {
    expect(CreateScheduledReportSchema.safeParse(baseInput()).success).toBe(
      true,
    );
  });

  it('gunluk saatlik ornek cron ifadesini kabul eder', () => {
    expect(
      CreateScheduledReportSchema.safeParse(baseInput({ cron: '30 9 * * *' }))
        .success,
    ).toBe(true);
  });

  it('gecersiz cron ifadesini reddeder', () => {
    const result = CreateScheduledReportSchema.safeParse(
      baseInput({ cron: 'her gun sabah' }),
    );
    expect(result.success).toBe(false);
  });

  it('bos alici listesini reddeder', () => {
    const result = CreateScheduledReportSchema.safeParse(
      baseInput({ recipients: [] }),
    );
    expect(result.success).toBe(false);
  });

  it('gecersiz e-posta adresini reddeder', () => {
    const result = CreateScheduledReportSchema.safeParse(
      baseInput({ recipients: ['gecersiz'] }),
    );
    expect(result.success).toBe(false);
  });

  it('isActive belirtilmezse varsayilan true olur', () => {
    const result = CreateScheduledReportSchema.parse(baseInput());
    expect(result.isActive).toBe(true);
  });
});
