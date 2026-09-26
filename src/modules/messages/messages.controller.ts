import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { AppException } from '../../core/errors/app.exception';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { MAX_MESSAGE_ATTACHMENT_SIZE_BYTES } from '../../core/validators/attachment-upload-validation';
import {
  CreateMessageSchema,
  MessageQuerySchema,
  SetConversationReadSchema,
  SetConversationStarSchema,
  type CreateMessageDto,
  type MessageQueryDto,
  type SetConversationReadDto,
  type SetConversationStarDto,
} from './dto/message.dto';
import {
  MessagesService,
  type ConversationDetail,
  type ConversationSummary,
  type MessageWithRecipients,
} from './messages.service';

@ModulePage('messages')
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @RequiresPermission('messages', 'VIEW')
  list(
    @Query(new ZodValidationPipe(MessageQuerySchema)) query: MessageQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PagedResult<ConversationSummary>> {
    return this.messages.list(user.id, query);
  }

  @Get('assignable-users')
  @RequiresPermission('messages', 'VIEW')
  listAssignableUsers(): Promise<
    { id: string; name: string; avatarUrl: string | null }[]
  > {
    return this.messages.listAssignableUsers();
  }

  @Get(':conversationId')
  @RequiresPermission('messages', 'VIEW')
  getById(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ConversationDetail> {
    return this.messages.getById(conversationId, user.id);
  }

  @Post()
  @RequiresPermission('messages', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateMessageSchema)) dto: CreateMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MessageWithRecipients> {
    return this.messages.create(user.tenantId, user.id, dto);
  }

  /** Mesaj gonderilmeden once dosyayi yukler - donen fileKey, POST /messages
   * body'sindeki attachments dizisine referans olarak verilir (bkz. message.dto.ts
   * MessageAttachmentRefSchema). */
  @Post('attachments')
  @RequiresPermission('messages', 'CREATE')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_MESSAGE_ATTACHMENT_SIZE_BYTES },
    }),
  )
  uploadAttachment(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{
    fileKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }> {
    if (!file) {
      throw new AppException(
        'FILE_REQUIRED',
        'Dosya yuklenmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.messages.uploadAttachment(user.tenantId, file);
  }

  /** Kullanici mesaji gondermeden vazgecip eki kaldirirsa, R2'de yetim dosya
   * kalmamasi icin temizlik. Sadece kendi tenant'inin anahtarini silebilir. */
  @Delete('attachments')
  @HttpCode(204)
  @RequiresPermission('messages', 'CREATE')
  deleteUnattachedFile(
    @Query('key') key: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    if (!key) {
      throw new AppException(
        'FILE_REQUIRED',
        'Dosya anahtari belirtilmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.messages.deleteUnattachedFile(user.tenantId, key);
  }

  @Patch(':conversationId/read')
  @HttpCode(204)
  @RequiresPermission('messages', 'VIEW')
  setRead(
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(SetConversationReadSchema))
    dto: SetConversationReadDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.messages.setConversationRead(conversationId, user.id, dto.read);
  }

  @Patch(':conversationId/star')
  @HttpCode(204)
  @RequiresPermission('messages', 'VIEW')
  setStar(
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(SetConversationStarSchema))
    dto: SetConversationStarDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.messages.setConversationStar(
      conversationId,
      user.id,
      user.tenantId,
      dto.starred,
    );
  }
}
