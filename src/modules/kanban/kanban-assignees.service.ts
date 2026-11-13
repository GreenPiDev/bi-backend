import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { FileUrlService } from '../../core/storage/file-url.service';

export interface KanbanAssignableUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Karta atanabilecek kisiler: her zaman islemi yapanin KENDI tenant'inin aktif
 * kullanicilari (kullanici karari) - bu yuzden tenant-scoped client kullanilir.
 */
@Injectable()
export class KanbanAssigneesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly tenantPrisma: TenantPrismaClient,
    private readonly fileUrl: FileUrlService,
  ) {}

  async list(): Promise<KanbanAssignableUser[]> {
    const users = await this.tenantPrisma.user.findMany({
      where: { isActive: true, isPlatformAdmin: false },
      select: { id: true, name: true, avatarKey: true, updatedAt: true },
      orderBy: { name: 'asc' },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      avatarUrl: this.fileUrl.build(user.avatarKey, user.updatedAt),
    }));
  }

  async assertAssignable(userId: string): Promise<void> {
    const user = await this.tenantPrisma.user.findFirst({
      where: { id: userId, isActive: true, isPlatformAdmin: false },
      select: { id: true },
    });
    if (!user) {
      throw new AppException(
        'USER_NOT_FOUND',
        'Secilen kullanici bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
