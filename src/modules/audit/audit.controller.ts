import { Controller, Get } from '@nestjs/common';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AuditService, type AuditLogView } from './audit.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequiresPermission('settings', 'VIEW')
  list(): Promise<AuditLogView[]> {
    return this.audit.list();
  }
}
