import { PipeTransform } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppException } from '../errors/app.exception';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppException(
        'VALIDATION_ERROR',
        'Gonderilen veri gecersiz.',
        HttpStatus.BAD_REQUEST,
        { issues: result.error.issues },
      );
    }
    return result.data;
  }
}
