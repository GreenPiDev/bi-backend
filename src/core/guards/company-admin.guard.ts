import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { RequestUser } from '../decorators/current-user.decorator';
import { AppException } from '../errors/app.exception';
import { PermissionsService } from '../permissions/permissions.service';

/**
 * Rol/izin yonetimi (modules/roles) kasitli olarak Permission sisteminin DISINDA
 * tutulur: bir dinamik role 'settings' sayfasi UPDATE izni verilmesi, o rolun BASKA
 * roller olusturup kendine daha genis yetki atayabilecegi anlamina gelmemeli
 * (yetki yukseltme riski). Sadece isCompanyAdmin=true rol tasiyan kullanicilar
 * gecebilir - bkz. docs/PLAN_ROL_YONETIMI.md SS6.
 */
@Injectable()
export class CompanyAdminGuard implements CanActivate {
  constructor(private readonly permissions: PermissionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) {
      throw new AppException(
        'UNAUTHORIZED',
        'Oturum bulunamadi.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const effective = await this.permissions.getEffectivePermissions(
      user.tenantId,
      user.roleIds,
    );
    if (!effective.isCompanyAdmin) {
      throw new AppException(
        'FORBIDDEN',
        'Bu islem sadece sirket yoneticisi (COMPANYADMIN) tarafindan yapilabilir.',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
