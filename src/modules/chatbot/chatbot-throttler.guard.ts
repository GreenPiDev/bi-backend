import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/** OpenAI maliyetini sinirlamak icin kullanici bazli hiz limiti (IP degil - ofis paylasimli olabilir). */
@Injectable()
export class ChatbotThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const user = (req as Request & { user?: { id?: string } }).user;
    return user?.id ?? req.ip ?? 'unknown';
  }
}
