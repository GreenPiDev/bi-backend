import { Module } from '@nestjs/common';
import { CalendarEventsModule } from '../calendar-events/calendar-events.module';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [CalendarEventsModule],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
