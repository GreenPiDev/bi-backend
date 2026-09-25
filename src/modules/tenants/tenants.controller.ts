import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AppException } from '../../core/errors/app.exception';
import { MAX_LOGO_IMAGE_SIZE_BYTES } from './logo-image-validation';
import {
  TenantsService,
  type PageAccessStatus,
  type TenantModuleStatus,
  type TenantProfile,
} from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get('me')
  getMyTenant(@CurrentUser() user: RequestUser): Promise<TenantProfile> {
    return this.tenants.getProfile(user.tenantId);
  }

  @Get('me/modules')
  listMyModules(
    @CurrentUser() user: RequestUser,
  ): Promise<TenantModuleStatus[]> {
    return this.tenants.listModules(user.tenantId);
  }

  @Get('me/page-modules')
  listMyPageModules(
    @CurrentUser() user: RequestUser,
  ): Promise<PageAccessStatus[]> {
    return this.tenants.listPageAccess(user.tenantId);
  }

  @Post('me/logo')
  @RequiresPermission('settings', 'UPDATE')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_LOGO_IMAGE_SIZE_BYTES },
    }),
  )
  uploadLogo(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<TenantProfile> {
    if (!file) {
      throw new AppException(
        'FILE_REQUIRED',
        'Resim yuklenmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.tenants.uploadLogo(user.tenantId, file);
  }

  @Delete('me/logo')
  @RequiresPermission('settings', 'UPDATE')
  removeLogo(@CurrentUser() user: RequestUser): Promise<TenantProfile> {
    return this.tenants.removeLogo(user.tenantId);
  }
}
