import { z } from 'zod';
import { AppException } from '../errors/app.exception';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({ email: z.string().email() });
  const pipe = new ZodValidationPipe(schema);

  it('gecerli veriyi oldugu gibi dondurur', () => {
    const result = pipe.transform({ email: 'a@b.com' });
    expect(result).toEqual({ email: 'a@b.com' });
  });

  it('gecersiz veride AppException firlatir', () => {
    expect(() => pipe.transform({ email: 'not-an-email' })).toThrow(
      AppException,
    );
  });

  it('AppException.code VALIDATION_ERROR olur', () => {
    try {
      pipe.transform({ email: 'not-an-email' });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe('VALIDATION_ERROR');
    }
  });
});
