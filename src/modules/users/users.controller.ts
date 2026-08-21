import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import type { SafeUser } from '../auth/auth.service';
import { InviteUserDto, InviteUserSchema } from './dto/invite-user.dto';
import { UpdateRoleDto, UpdateRoleSchema } from './dto/update-role.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<SafeUser[]> {
    return this.users.list();
  }

  @Roles('OWNER', 'ADMIN')
  @Post('invite')
  invite(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(InviteUserSchema)) dto: InviteUserDto,
  ): Promise<{ token: string; expiresAt: Date }> {
    return this.users.invite(user.role, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id/role')
  updateRole(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRoleSchema)) dto: UpdateRoleDto,
  ): Promise<SafeUser> {
    return this.users.updateRole(user, id, dto.role);
  }
}
