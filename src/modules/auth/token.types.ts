import type { UserRole } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  isPlatformAdmin: boolean;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  tenantId: string;
  type: 'refresh';
}

export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL = '7d';
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
