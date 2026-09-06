import type { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

describe('RealtimeService.emitToTenant', () => {
  it('dogru tenant room una dogru event/payload ile emit eder', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const gateway = { server: { to } } as unknown as RealtimeGateway;
    const service = new RealtimeService(gateway);

    service.emitToTenant('tenant-42', 'tenant.modules.updated', { foo: 'bar' });

    expect(to).toHaveBeenCalledWith('tenant:tenant-42');
    expect(emit).toHaveBeenCalledWith('tenant.modules.updated', { foo: 'bar' });
  });
});

describe('RealtimeService.emitToAll', () => {
  it('room ayirt etmeden tum baglantilara emit eder', () => {
    const emit = vi.fn();
    const gateway = { server: { emit } } as unknown as RealtimeGateway;
    const service = new RealtimeService(gateway);

    service.emitToAll('page-modules.updated', [{ pageKey: 'accounts' }]);

    expect(emit).toHaveBeenCalledWith('page-modules.updated', [
      { pageKey: 'accounts' },
    ]);
  });
});
