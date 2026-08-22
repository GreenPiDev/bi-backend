import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../core/decorators/roles.decorator';
import { AuditService, type AuditLogView } from './audit.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles('OWNER', 'ADMIN')
  list(): Promise<AuditLogView[]> {
    return this.audit.list();
  }
}
