import { isTriggered } from './check-alerts.processor';

describe('isTriggered', () => {
  it('lt: deger esikten kucukse tetiklenir', () => {
    expect(isTriggered(500, 'lt', 1000)).toBe(true);
    expect(isTriggered(1000, 'lt', 1000)).toBe(false);
    expect(isTriggered(1500, 'lt', 1000)).toBe(false);
  });

  it('lte: deger esige esitse de tetiklenir', () => {
    expect(isTriggered(1000, 'lte', 1000)).toBe(true);
    expect(isTriggered(1001, 'lte', 1000)).toBe(false);
  });

  it('gt: deger esikten buyukse tetiklenir', () => {
    expect(isTriggered(1500, 'gt', 1000)).toBe(true);
    expect(isTriggered(1000, 'gt', 1000)).toBe(false);
  });

  it('gte: deger esige esitse de tetiklenir', () => {
    expect(isTriggered(1000, 'gte', 1000)).toBe(true);
    expect(isTriggered(999, 'gte', 1000)).toBe(false);
  });
});
