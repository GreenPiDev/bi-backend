import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CalendarSharesService,
  type CalendarShareUser,
} from './calendar-shares.service';
import {
  UpdateCalendarGrantsSchema,
  type UpdateCalendarGrantsDto,
} from './dto/calendar-share.dto';

@ModulePage('calendar')
@Controller('calendar-shares')
export class CalendarSharesController {
  constructor(private readonly calendarShares: CalendarSharesService) {}

  @Get('my-grants')
  @RequiresPermission('calendar', 'VIEW')
  getMyGrants(@CurrentUser() user: RequestUser): Promise<CalendarShareUser[]> {
    return this.calendarShares.getGrants(user.id);
  }

  @Put('my-grants')
  @RequiresPermission('calendar', 'VIEW')
  async updateMyGrants(
    @Body(new ZodValidationPipe(UpdateCalendarGrantsSchema))
    dto: UpdateCalendarGrantsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CalendarShareUser[]> {
    await this.calendarShares.setGrants(user.tenantId, user.id, dto.viewerIds);
    return this.calendarShares.getGrants(user.id);
  }

  @Get('shared-with-me')
  @RequiresPermission('calendar', 'VIEW')
  getSharedWithMe(
    @CurrentUser() user: RequestUser,
  ): Promise<CalendarShareUser[]> {
    return this.calendarShares.getSharedWithMe(user.id);
  }
}
