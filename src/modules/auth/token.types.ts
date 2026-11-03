export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  roleIds: string[];
  isPlatformAdmin: boolean;
  /** Sadece demo kullanicilarda var (bkz. modules/demo-accounts) - DemoAccessGuard
   * her istekte DB'ye gitmeden kisitlama/sure kontrolu yapabilsin diye token'da. */
  isDemoUser?: boolean;
  /** Epoch ms; demo kullanicisi henuz hic login olmadiysa yok. */
  demoExpiresAt?: number;
  type: 'access';
  /** JWT standart claim'i (saniye); jwt.sign otomatik ekler. */
  iat?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  tenantId: string;
  type: 'refresh';
  iat?: number;
}

export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL = '7d';
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
