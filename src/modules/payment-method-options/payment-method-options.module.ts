import { Module } from '@nestjs/common';
import { PaymentMethodOptionsController } from './payment-method-options.controller';
import { PaymentMethodOptionsService } from './payment-method-options.service';

@Module({
  controllers: [PaymentMethodOptionsController],
  providers: [PaymentMethodOptionsService],
  exports: [PaymentMethodOptionsService],
})
export class PaymentMethodOptionsModule {}
