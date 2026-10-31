import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../core/decorators/public.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateDemoAccountSchema,
  type CreateDemoAccountDto,
} from './dto/create-demo-account.dto';
import {
  DemoAccountsService,
  type CreatedDemoAccount,
} from './demo-accounts.service';

/** Kimliksiz, tanitim sayfasindan cagrilan uc - spam/toplu hesap acmaya karsi IP
 * bazli siki rate limit (saatte 5). */
@Controller('demo-accounts')
export class DemoAccountsController {
  constructor(private readonly demoAccounts: DemoAccountsService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateDemoAccountSchema))
    dto: CreateDemoAccountDto,
  ): Promise<CreatedDemoAccount> {
    return this.demoAccounts.create(dto);
  }
}
