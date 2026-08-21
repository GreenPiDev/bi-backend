import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController();

  it('status ok doner', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
  });

  it('gecerli bir ISO timestamp doner', () => {
    const result = controller.check();
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });
});
