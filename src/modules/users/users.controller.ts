import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AppException } from '../../core/errors/app.exception';
import { CompanyAdminGuard } from '../../core/guards/company-admin.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import type { SafeUser } from '../auth/auth.service';
import { MAX_AVATAR_IMAGE_SIZE_BYTES } from './avatar-image-validation';
import {
  ChangePasswordDto,
  ChangePasswordSchema,
} from './dto/change-password.dto';
import { CreateUserDto, CreateUserSchema } from './dto/create-user.dto';
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

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_AVATAR_IMAGE_SIZE_BYTES },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UserProfile> {
    if (!file) {
      throw new AppException(
        'FILE_REQUIRED',
        'Resim yuklenmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.users.uploadAvatar(user, file);
  }

  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: RequestUser): Promise<UserProfile> {
    return this.users.removeAvatar(user);
  }

  @UseGuards(CompanyAdminGuard)
  @Post()
  createUser(
    @Body(new ZodValidationPipe(CreateUserSchema)) dto: CreateUserDto,
  ): Promise<{ user: SafeUser; temporaryPassword: string }> {
    return this.users.createUser(dto);
  }

  @UseGuards(CompanyAdminGuard)
  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<{ temporaryPassword: string }> {
    return this.users.resetPassword(user, id);
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
