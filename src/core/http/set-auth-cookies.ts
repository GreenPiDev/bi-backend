import type { Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../../modules/auth/token.types';

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}
