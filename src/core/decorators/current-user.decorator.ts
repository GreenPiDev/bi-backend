import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export interface RequestUser {
  id: string;
  tenantId: string;
  roleIds: string[];
  isPlatformAdmin: boolean;
  isDemoUser?: boolean;
  /** Epoch ms - bkz. AccessTokenPayload.demoExpiresAt. */
  demoExpiresAt?: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<{ user: RequestUser }>();
    return request.user;
  },
);
