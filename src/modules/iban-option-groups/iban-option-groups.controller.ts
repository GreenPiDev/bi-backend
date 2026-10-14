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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AppException } from '../../core/errors/app.exception';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { MAX_LOGO_IMAGE_SIZE_BYTES } from '../tenants/logo-image-validation';
import {
  IbanOptionGroupSchema,
  type IbanOptionGroupDto,
} from './dto/iban-option-group.dto';
import {
  IbanOptionGroupsService,
  type IbanOptionGroupResponse,
} from './iban-option-groups.service';

@RequiresModule('crm')
@Controller('iban-option-groups')
export class IbanOptionGroupsController {
  constructor(private readonly ibanOptionGroups: IbanOptionGroupsService) {}

  @Get()
  list(): Promise<IbanOptionGroupResponse[]> {
    return this.ibanOptionGroups.list();
  }

  @Post()
  @RequiresPermission('settings', 'UPDATE')
  create(
    @Body(new ZodValidationPipe(IbanOptionGroupSchema))
    dto: IbanOptionGroupDto,
  ): Promise<IbanOptionGroupResponse> {
    return this.ibanOptionGroups.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('settings', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(IbanOptionGroupSchema))
    dto: IbanOptionGroupDto,
  ): Promise<IbanOptionGroupResponse> {
    return this.ibanOptionGroups.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('settings', 'UPDATE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.ibanOptionGroups.remove(id);
  }

  @Post(':id/logo')
  @RequiresPermission('settings', 'UPDATE')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_LOGO_IMAGE_SIZE_BYTES },
    }),
  )
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<IbanOptionGroupResponse> {
    if (!file) {
      throw new AppException(
        'FILE_REQUIRED',
        'Resim yuklenmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.ibanOptionGroups.uploadLogo(id, file);
  }

  @Delete(':id/logo')
  @RequiresPermission('settings', 'UPDATE')
  removeLogo(@Param('id') id: string): Promise<IbanOptionGroupResponse> {
    return this.ibanOptionGroups.removeLogo(id);
  }
}
