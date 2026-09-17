import { z } from 'zod';
import { arrayQueryParam } from './list-query.dto';

describe('arrayQueryParam', () => {
  const schema = z.object({ ids: arrayQueryParam(z.string().uuid()) });
  const ID_1 = '11111111-1111-1111-8111-111111111111';
  const ID_2 = '22222222-2222-2222-8222-222222222222';

  it('deger verilmemisse undefined kalir', () => {
    expect(schema.parse({})).toEqual({ ids: undefined });
  });

  it("tekil deger (Express tek query param icin string dondurur) array'e sarilir", () => {
    expect(schema.parse({ ids: ID_1 })).toEqual({ ids: [ID_1] });
  });

  it('coklu deger (Express `?ids=a&ids=b` icin array dondurur) oldugu gibi kabul edilir', () => {
    expect(schema.parse({ ids: [ID_1, ID_2] })).toEqual({ ids: [ID_1, ID_2] });
  });

  it('iceriden gecersiz bir deger varsa hata firlatir', () => {
    expect(() => schema.parse({ ids: ['not-a-uuid'] })).toThrow();
  });
});
