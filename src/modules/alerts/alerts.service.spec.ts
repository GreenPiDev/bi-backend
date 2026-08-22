import { AppException } from '../../core/errors/app.exception';
import { AlertsService } from './alerts.service';

const fakeAudit = { log: vi.fn() } as never;
const ALERT_ID = '11111111-1111-1111-1111-111111111111';
const WIDGET_ID = '22222222-2222-2222-2222-222222222222';
const TENANT_ID = 't1';

function createAlertRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ALERT_ID,
    tenantId: TENANT_ID,
    widgetId: WIDGET_ID,
    operator: 'lt',
    threshold: 1000,
    recipients: ['a@test.com'],
    lastTriggeredAt: null,
    ...overrides,
  };
}

function createPrisma(alertRow: unknown = createAlertRow()) {
  return {
    alert: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(alertRow),
      create: vi.fn().mockResolvedValue(alertRow),
      update: vi.fn().mockResolvedValue(alertRow),
      delete: vi.fn().mockResolvedValue(alertRow),
    },
  };
}

function createWidgets(found = true) {
  return {
    findByIdAcrossDashboards: vi
      .fn()
      .mockImplementation(() =>
        found
          ? Promise.resolve({ id: WIDGET_ID })
          : Promise.reject(
              new AppException('NOT_FOUND', 'Widget bulunamadi.', 404),
            ),
      ),
  };
}

describe('AlertsService', () => {
  it('create: widget sahipligini dogrulayip alarm olusturur', async () => {
    const prisma = createPrisma();
    const widgets = createWidgets(true);
    const service = new AlertsService(
      prisma as never,
      widgets as never,
      fakeAudit,
    );
    await service.create(TENANT_ID, {
      widgetId: WIDGET_ID,
      operator: 'lt',
      threshold: 1000,
      recipients: ['a@test.com'],
    });
    expect(widgets.findByIdAcrossDashboards).toHaveBeenCalledWith(WIDGET_ID);
    expect(prisma.alert.create).toHaveBeenCalled();
  });

  it('create: baska tenantin widget id sini kullanirsa NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const widgets = createWidgets(false);
    const service = new AlertsService(
      prisma as never,
      widgets as never,
      fakeAudit,
    );
    await expect(
      service.create(TENANT_ID, {
        widgetId: WIDGET_ID,
        operator: 'lt',
        threshold: 1000,
        recipients: ['a@test.com'],
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
    expect(prisma.alert.create).not.toHaveBeenCalled();
  });

  it('update: bulunamayan alarm icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new AlertsService(
      prisma as never,
      createWidgets(true) as never,
      fakeAudit,
    );
    await expect(
      service.update(ALERT_ID, { threshold: 500 }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('remove: alarmi siler', async () => {
    const prisma = createPrisma();
    const service = new AlertsService(
      prisma as never,
      createWidgets(true) as never,
      fakeAudit,
    );
    await service.remove(ALERT_ID);
    expect(prisma.alert.delete).toHaveBeenCalledWith({
      where: { id: ALERT_ID },
    });
  });
});
