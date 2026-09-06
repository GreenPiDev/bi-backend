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
  list(
    @Query(new ZodValidationPipe(CalendarEventQuerySchema))
    query: CalendarEventQueryDto,
  ): Promise<CalendarEventWithAttendees[]> {
    return this.calendarEvents.list(query);
  }

  @Get('assignable-users')
  listAssignableUsers(): Promise<{ id: string; name: string }[]> {
    return this.calendarEvents.listAssignableUsers();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<CalendarEventWithAttendees> {
    return this.calendarEvents.getById(id);
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
  ): Promise<CalendarEventWithAttendees> {
    return this.calendarEvents.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('calendar', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.calendarEvents.remove(id);
  }
}
