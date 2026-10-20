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
  Res,
} from '@nestjs/common';
import type { Contact } from '@prisma/client';
import type { Response } from 'express';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { sendExportFile } from '../../core/http/export-response.util';
import { ContactsService, type ContactWithMeta } from './contacts.service';
import {
  ContactExportQuerySchema,
  ContactQuerySchema,
  CreateContactSchema,
  UpdateContactSchema,
  type ContactExportQueryDto,
  type ContactQueryDto,
  type CreateContactDto,
  type UpdateContactDto,
} from './dto/contact.dto';

@ModulePage('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @RequiresPermission('contacts', 'VIEW')
  list(
    @Query(new ZodValidationPipe(ContactQuerySchema)) query: ContactQueryDto,
  ): Promise<PagedResult<ContactWithMeta>> {
    return this.contacts.list(query);
  }

  @Get('export')
  @RequiresPermission('contacts', 'EXPORT')
  async export(
    @Query(new ZodValidationPipe(ContactExportQuerySchema))
    query: ContactExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.contacts.exportFiltered(query);
    sendExportFile(res, buffer, 'xlsx', 'kisiler');
  }

  @Get(':id')
  @RequiresPermission('contacts', 'VIEW')
  getById(@Param('id') id: string) {
    return this.contacts.getById(id);
  }

  @Post()
  @RequiresPermission('contacts', 'CREATE')
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreateContactSchema)) dto: CreateContactDto,
  ): Promise<Contact> {
    return this.contacts.create(user.id, dto);
  }

  @Patch(':id')
  @RequiresPermission('contacts', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateContactSchema)) dto: UpdateContactDto,
  ): Promise<Contact> {
    return this.contacts.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('contacts', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.contacts.remove(id);
  }
}
