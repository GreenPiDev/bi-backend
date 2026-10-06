import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type DrawingLibraryComponent } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import type {
  CreateDrawingLibraryComponentDto,
  UpdateDrawingLibraryComponentDto,
} from './dto/drawing-library-component.dto';

@Injectable()
export class DrawingLibraryService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
  ) {}

  list(): Promise<DrawingLibraryComponent[]> {
    return this.prisma.drawingLibraryComponent.findMany({
      orderBy: { name: 'asc' },
    });
  }

  private async findOrThrow(id: string): Promise<DrawingLibraryComponent> {
    const component = await this.prisma.drawingLibraryComponent.findFirst({
      where: { id },
    });
    if (!component) {
      throw new AppException(
        'NOT_FOUND',
        'Kütüphane komponenti bulunamadı.',
        HttpStatus.NOT_FOUND,
      );
    }
    return component;
  }

  /** Yeni olusturulan satirlar her zaman isBuiltIn=false - bu bayrak sadece
   * provizyon servisinin (built-in seed kopyalama) kendi yazdigi satirlarda true olur. */
  async create(
    dto: CreateDrawingLibraryComponentDto,
  ): Promise<DrawingLibraryComponent> {
    try {
      return await this.prisma.drawingLibraryComponent.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: { ...dto, isBuiltIn: false } as never,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'DRAWING_LIBRARY_COMPONENT_KEY_ALREADY_EXISTS',
          'Bu anahtar zaten kullanımda.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateDrawingLibraryComponentDto,
  ): Promise<DrawingLibraryComponent> {
    await this.findOrThrow(id);
    try {
      return await this.prisma.drawingLibraryComponent.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'DRAWING_LIBRARY_COMPONENT_KEY_ALREADY_EXISTS',
          'Bu anahtar zaten kullanımda.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.drawingLibraryComponent.delete({ where: { id } });
  }
}
