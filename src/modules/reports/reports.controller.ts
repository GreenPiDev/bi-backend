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
import type { ScheduledReport } from '@prisma/client';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateScheduledReportSchema,
  UpdateScheduledReportSchema,
  type CreateScheduledReportDto,
  type UpdateScheduledReportDto,
} from './dto/report.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@Roles('OWNER', 'ADMIN')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(): Promise<ScheduledReport[]> {
    return this.reports.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateScheduledReportSchema))
    dto: CreateScheduledReportDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ScheduledReport> {
    return this.reports.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateScheduledReportSchema))
    dto: UpdateScheduledReportDto,
  ): Promise<ScheduledReport> {
    return this.reports.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.reports.remove(id);
  }
}
