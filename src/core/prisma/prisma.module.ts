import { Global, Module } from '@nestjs/common';
import { RawSqlService } from '../database/raw-sql.service';
import { PrismaService } from './prisma.service';
import { TENANT_PRISMA } from './tenant-prisma.token';
import { tenantScopedExtension } from './tenant-scoped.extension';

@Global()
@Module({
  providers: [
    PrismaService,
    RawSqlService,
    {
      provide: TENANT_PRISMA,
      useFactory: (prisma: PrismaService) => tenantScopedExtension(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [PrismaService, TENANT_PRISMA, RawSqlService],
})
export class PrismaModule {}
