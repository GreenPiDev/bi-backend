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
import type { Account } from '@prisma/client';
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
import { AccountsService, type AccountWithMeta } from './accounts.service';
import {
  AccountExportQuerySchema,
  AccountQuerySchema,
  CreateAccountSchema,
  UpdateAccountSchema,
  type AccountExportQueryDto,
  type AccountQueryDto,
  type CreateAccountDto,
  type UpdateAccountDto,
} from './dto/account.dto';

@ModulePage('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequiresPermission('accounts', 'VIEW')
  list(
    @Query(new ZodValidationPipe(AccountQuerySchema)) query: AccountQueryDto,
  ): Promise<PagedResult<AccountWithMeta>> {
    return this.accounts.list(query);
  }

  @Get('export')
  @RequiresPermission('accounts', 'EXPORT')
  async export(
    @Query(new ZodValidationPipe(AccountExportQuerySchema))
    query: AccountExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.accounts.exportFiltered(query);
    sendExportFile(res, buffer, 'xlsx', 'firmalar');
  }

  @Get(':id')
  @RequiresPermission('accounts', 'VIEW')
  getById(@Param('id') id: string) {
    return this.accounts.getById(id);
  }

  @Post()
  @RequiresPermission('accounts', 'CREATE')
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreateAccountSchema)) dto: CreateAccountDto,
  ): Promise<Account> {
    return this.accounts.create(user.id, dto);
  }

  @Patch(':id')
  @RequiresPermission('accounts', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAccountSchema)) dto: UpdateAccountDto,
  ): Promise<Account> {
    return this.accounts.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('accounts', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.accounts.remove(id);
  }
}
