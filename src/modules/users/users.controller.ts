import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { CompanyAdminGuard } from '../../core/guards/company-admin.guard';
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
  @RequiresPermission('settings', 'VIEW', 'users')
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

  @UseGuards(CompanyAdminGuard)
  @Post('invite')
  invite(
    @Body(new ZodValidationPipe(InviteUserSchema)) dto: InviteUserDto,
  ): Promise<{ token: string; expiresAt: Date }> {
    return this.users.invite(dto);
  }

  @UseGuards(CompanyAdminGuard)
  @Patch(':id/role')
  updateRole(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRoleSchema)) dto: UpdateRoleDto,
  ): Promise<SafeUser> {
    return this.users.updateRole(user, id, dto);
  }
}
