import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { RequestUser } from '../decorators/current-user.decorator';
import { AppException } from '../errors/app.exception';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!request.user?.isPlatformAdmin) {
      throw new AppException(
        'FORBIDDEN',
        'Bu islem icin yetkin yok.',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
