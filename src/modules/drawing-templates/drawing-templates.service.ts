import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DrawingPanelTemplate } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import type {
  CreateDrawingPanelTemplateDto,
  UpdateDrawingPanelTemplateDto,
} from './dto/drawing-panel-template.dto';

@Injectable()
export class DrawingTemplatesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
  ) {}

  list(): Promise<DrawingPanelTemplate[]> {
    return this.prisma.drawingPanelTemplate.findMany({
      orderBy: { name: 'asc' },
    });
  }

  private async findOrThrow(id: string): Promise<DrawingPanelTemplate> {
    const template = await this.prisma.drawingPanelTemplate.findFirst({
      where: { id },
    });
    if (!template) {
      throw new AppException(
        'NOT_FOUND',
        'Pano şablonu bulunamadı.',
        HttpStatus.NOT_FOUND,
      );
    }
    return template;
  }

  /** Yeni olusturulan satirlar her zaman isBuiltIn=false - bu bayrak sadece
   * provizyon servisinin (built-in seed kopyalama) kendi yazdigi satirlarda true olur. */
  create(dto: CreateDrawingPanelTemplateDto): Promise<DrawingPanelTemplate> {
    return this.prisma.drawingPanelTemplate.create({
      // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
      data: { ...dto, isBuiltIn: false } as never,
    });
  }

  async update(
    id: string,
    dto: UpdateDrawingPanelTemplateDto,
  ): Promise<DrawingPanelTemplate> {
    await this.findOrThrow(id);
    return this.prisma.drawingPanelTemplate.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.drawingPanelTemplate.delete({ where: { id } });
  }
}
