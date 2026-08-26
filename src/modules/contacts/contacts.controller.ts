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
import type { Contact } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ContactsService } from './contacts.service';
import {
  ContactQuerySchema,
  CreateContactSchema,
  UpdateContactSchema,
  type ContactQueryDto,
  type CreateContactDto,
  type UpdateContactDto,
} from './dto/contact.dto';

@RequiresModule('crm')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ContactQuerySchema)) query: ContactQueryDto,
  ): Promise<PagedResult<Contact>> {
    return this.contacts.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.contacts.getById(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'SALES')
  create(
    @Body(new ZodValidationPipe(CreateContactSchema)) dto: CreateContactDto,
  ): Promise<Contact> {
    return this.contacts.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'SALES')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateContactSchema)) dto: UpdateContactDto,
  ): Promise<Contact> {
    return this.contacts.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.contacts.remove(id);
  }
}
