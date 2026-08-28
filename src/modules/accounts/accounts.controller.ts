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
import type { Account } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { AccountsService, type AccountWithMeta } from './accounts.service';
import {
  AccountQuerySchema,
  CreateAccountSchema,
  UpdateAccountSchema,
  type AccountQueryDto,
  type CreateAccountDto,
  type UpdateAccountDto,
} from './dto/account.dto';

@RequiresModule('crm')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(AccountQuerySchema)) query: AccountQueryDto,
  ): Promise<PagedResult<AccountWithMeta>> {
    return this.accounts.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.accounts.getById(id);
  }

  @Post()
  @RequiresPermission('accounts', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateAccountSchema)) dto: CreateAccountDto,
  ): Promise<Account> {
    return this.accounts.create(dto);
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
