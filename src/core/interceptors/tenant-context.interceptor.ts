import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { RequestUser } from '../decorators/current-user.decorator';
import { TenantContext } from '../tenant/tenant-context';

/**
 * Prisma'nin lazy promise'leri yuzunden TenantContext.run()'in senkron callback'inde
 * sadece next.handle() cagirmak yetmez -- asil sorgu, Observable subscribe edildiginde
 * calisir. Bu yuzden subscribe'i bizzat run() icinde tetikliyoruz.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;

    if (!user) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      TenantContext.run(
        { tenantId: user.tenantId, userId: user.id, role: user.role },
        () => {
          next.handle().subscribe(subscriber);
        },
      );
    });
  }
}
