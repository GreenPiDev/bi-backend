import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import type { SafeUser } from '../auth/auth.service';
import {
  ChangePasswordDto,
  ChangePasswordSchema,
} from './dto/change-password.dto';
import { InviteUserDto, InviteUserSchema } from './dto/invite-user.dto';
import {
  UpdateProfileDto,
  UpdateProfileSchema,
} from './dto/update-profile.dto';
import { UpdateRoleDto, UpdateRoleSchema } from './dto/update-role.dto';
import { type UserProfile, UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<SafeUser[]> {
    return this.users.list();
  }

  @Get('me')
  getProfile(@CurrentUser() user: RequestUser): Promise<UserProfile> {
    return this.users.getProfile(user);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    return this.users.updateProfile(user, dto);
  }

  @Patch('me/password')
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(ChangePasswordSchema)) dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    return this.users.changePassword(user, dto);
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
