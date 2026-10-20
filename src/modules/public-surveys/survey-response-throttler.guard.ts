import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/** Public, kimlik dogrulamasiz anket ucu - IP + token kombinasyonuna gore sinirlar
 * (login-throttler.guard.ts ile ayni desen, CLAUDE.md SS10). */
@Injectable()
export class SurveyResponseThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const token = (req.params as Record<string, unknown> | undefined)?.token;
    return `${req.ip}:${typeof token === 'string' ? token : 'unknown'}`;
  }
}
