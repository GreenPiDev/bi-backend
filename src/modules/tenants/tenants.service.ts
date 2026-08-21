import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { slugify } from './slugify';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTenantWithUniqueSlug(
    name: string,
  ): Promise<{ id: string; slug: string }> {
    const base = slugify(name) || 'sirket';
    let slug = base;
    let attempt = 0;

    while (await this.prisma.tenant.findUnique({ where: { slug } })) {
      attempt += 1;
      slug = `${base}-${attempt > 3 ? randomUUID().slice(0, 6) : attempt + 1}`;
    }

    return { id: randomUUID(), slug };
  }
}
