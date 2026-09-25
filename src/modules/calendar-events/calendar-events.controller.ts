import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CalendarEventsService,
  type CalendarEventWithAttendees,
} from './calendar-events.service';
import {
  CalendarEventQuerySchema,
  CreateCalendarEventSchema,
  UpdateCalendarEventSchema,
  type CalendarEventQueryDto,
  type CreateCalendarEventDto,
  type UpdateCalendarEventDto,
} from './dto/calendar-event.dto';

@ModulePage('calendar')
@Controller('calendar-events')
export class CalendarEventsController {
  constructor(private readonly calendarEvents: CalendarEventsService) {}

  @Get()
  @RequiresPermission('calendar', 'VIEW')
  list(
    @Query(new ZodValidationPipe(CalendarEventQuerySchema))
    query: CalendarEventQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CalendarEventWithAttendees[]> {
    return this.calendarEvents.list(query, user.id);
  }

  @Get('assignable-users')
  @RequiresPermission('calendar', 'VIEW')
  listAssignableUsers(): Promise<
    { id: string; name: string; avatarUrl: string | null }[]
  > {
    return this.calendarEvents.listAssignableUsers();
  }

  @Get(':id')
  @RequiresPermission('calendar', 'VIEW')
  getById(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<CalendarEventWithAttendees> {
    return this.calendarEvents.getById(id, user.id);
  }

  @Post()
  @RequiresPermission('calendar', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateCalendarEventSchema))
    dto: CreateCalendarEventDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CalendarEventWithAttendees> {
    return this.calendarEvents.create(user.tenantId, user.id, dto);
  }

  @Patch(':id')
  @RequiresPermission('calendar', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCalendarEventSchema))
    dto: UpdateCalendarEventDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CalendarEventWithAttendees> {
    return this.calendarEvents.update(id, dto, user.tenantId);
  }

  @Delete(':id')
  @RequiresPermission('calendar', 'DELETE')
  @HttpCode(204)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.calendarEvents.remove(id, user.tenantId);
  }
}
