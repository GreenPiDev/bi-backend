import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { PaymentMethodOption } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreatePaymentMethodOptionSchema,
  UpdatePaymentMethodOptionSchema,
  type CreatePaymentMethodOptionDto,
  type UpdatePaymentMethodOptionDto,
} from './dto/payment-method-option.dto';
import { PaymentMethodOptionsService } from './payment-method-options.service';

@RequiresModule('crm')
@Controller('payment-method-options')
export class PaymentMethodOptionsController {
  constructor(
    private readonly paymentMethodOptions: PaymentMethodOptionsService,
  ) {}

  @Get()
  list(): Promise<PaymentMethodOption[]> {
    return this.paymentMethodOptions.list();
  }

  @Post()
  @RequiresPermission('settings', 'UPDATE')
  create(
    @Body(new ZodValidationPipe(CreatePaymentMethodOptionSchema))
    dto: CreatePaymentMethodOptionDto,
  ): Promise<PaymentMethodOption> {
    return this.paymentMethodOptions.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('settings', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePaymentMethodOptionSchema))
    dto: UpdatePaymentMethodOptionDto,
  ): Promise<PaymentMethodOption> {
    return this.paymentMethodOptions.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('settings', 'UPDATE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.paymentMethodOptions.remove(id);
  }
}
