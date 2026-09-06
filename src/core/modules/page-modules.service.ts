import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PAGE_REGISTRY, isKnownPageKey } from './page-registry';
import { isKnownModuleKey } from './module-registry';

export interface PageModuleAssignment {
  pageKey: string;
  label: string;
  /** Sayfa birden fazla modulde olabilir - tenant bunlardan HERHANGI birine sahipse
   * sayfa erisilebilir sayilir (bkz. TenantsService.listPageAccess). Bos dizi = sayfa
   * herhangi bir modul gerektirmez. */
  moduleKeys: string[];
}

@Injectable()
export class PageModulesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAssignments(): Promise<PageModuleAssignment[]> {
    const rows = await this.prisma.pageModuleAssignment.findMany();
    const moduleKeysByPageKey = new Map<string, string[]>();
    for (const row of rows) {
      const existing = moduleKeysByPageKey.get(row.pageKey) ?? [];
      existing.push(row.moduleKey);
      moduleKeysByPageKey.set(row.pageKey, existing);
    }
    return PAGE_REGISTRY.map((page) => ({
      pageKey: page.key,
      label: page.label,
      moduleKeys: moduleKeysByPageKey.get(page.key) ?? [],
    }));
  }

  /** ModuleGuard tarafindan istek basina kullanilir - tek sayfa icin dogrudan sorgu,
   * listAssignments()'in tum PAGE_REGISTRY'yi donmesine gerek yok. */
  async getModuleKeysForPage(pageKey: string): Promise<string[]> {
    const rows = await this.prisma.pageModuleAssignment.findMany({
      where: { pageKey },
    });
    return rows.map((row) => row.moduleKey);
  }

  async setAssignment(
    pageKey: string,
    moduleKeys: string[],
  ): Promise<PageModuleAssignment[]> {
    if (!isKnownPageKey(pageKey)) {
      throw new AppException(
        'UNKNOWN_PAGE',
        'Bilinmeyen sayfa anahtari.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const uniqueModuleKeys = [...new Set(moduleKeys)];
    for (const moduleKey of uniqueModuleKeys) {
      if (!isKnownModuleKey(moduleKey)) {
        throw new AppException(
          'UNKNOWN_MODULE',
          'Bilinmeyen modul.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    await this.prisma.pageModuleAssignment.deleteMany({ where: { pageKey } });
    if (uniqueModuleKeys.length > 0) {
      await this.prisma.pageModuleAssignment.createMany({
        data: uniqueModuleKeys.map((moduleKey) => ({ pageKey, moduleKey })),
      });
    }

    return this.listAssignments();
  }
}
