import { Controller, Get, Query } from '@nestjs/common';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { AuditService, type AuditLogView } from './audit.service';
import {
  AuditLogQuerySchema,
  type AuditLogQueryDto,
} from './dto/audit-log.dto';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequiresPermission('settings', 'VIEW')
  list(
    @Query(new ZodValidationPipe(AuditLogQuerySchema)) query: AuditLogQueryDto,
  ): Promise<PagedResult<AuditLogView>> {
    return this.audit.listPaged(query);
  }
}
