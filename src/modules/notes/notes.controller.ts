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
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateNoteSchema,
  UpdateNoteSchema,
  type CreateNoteDto,
  type UpdateNoteDto,
} from './dto/note.dto';
import { NotesService, type NoteWithReminder } from './notes.service';

/**
 * Bilerek hicbir @RequiresPermission/@ModulePage tasimiyor - /anasayfa (home,
 * page-registry'de alwaysVisible) icine gomulu bir not panosu (bkz. docs/VARSAYIMLAR.md):
 * gorunurluk (bana-ozel/paylasimli) servis katmaninda Note.isPrivate + createdById
 * uzerinden kontrol edilir, NotificationsController ile ayni "izin kontrolu
 * gerektirmez" desenini kullanir. Tenant izolasyonu tenant-scoped extension
 * uzerinden saglanir.
 */
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser): Promise<NoteWithReminder[]> {
    return this.notes.list(user.id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateNoteSchema)) dto: CreateNoteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<NoteWithReminder> {
    return this.notes.create(user.tenantId, user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateNoteSchema)) dto: UpdateNoteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<NoteWithReminder> {
    return this.notes.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.notes.remove(id, user.id);
  }
}
