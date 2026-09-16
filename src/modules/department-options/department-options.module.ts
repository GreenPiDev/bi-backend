import { Module } from '@nestjs/common';
import { DepartmentOptionsController } from './department-options.controller';
import { DepartmentOptionsService } from './department-options.service';

@Module({
  controllers: [DepartmentOptionsController],
  providers: [DepartmentOptionsService],
  exports: [DepartmentOptionsService],
})
export class DepartmentOptionsModule {}
