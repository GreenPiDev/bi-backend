import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

function createTokenService(secrets: Record<string, string>): TokenService {
  const config = {
    getOrThrow: (key: string) => secrets[key],
  } as unknown as ConfigService;
  return new TokenService(new JwtService(), config);
}

describe('TokenService', () => {
  const tokens = createTokenService({
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
  });

  it('access token imzalar ve dogrular', () => {
    const token = tokens.signAccessToken({
      sub: 'u1',
      tenantId: 't1',
      roleIds: ['r1'],
      isPlatformAdmin: false,
    });
    const payload = tokens.verifyAccessToken(token);
    expect(payload).toMatchObject({
      sub: 'u1',
      tenantId: 't1',
      roleIds: ['r1'],
      type: 'access',
    });
  });

  it('refresh token imzalar ve dogrular', () => {
    const token = tokens.signRefreshToken({ sub: 'u1', tenantId: 't1' });
    const payload = tokens.verifyRefreshToken(token);
    expect(payload).toMatchObject({
      sub: 'u1',
      tenantId: 't1',
      type: 'refresh',
    });
  });

  it('access token, refresh secret ile dogrulanamaz', () => {
    const token = tokens.signAccessToken({
      sub: 'u1',
      tenantId: 't1',
      roleIds: ['r1'],
      isPlatformAdmin: false,
    });
    expect(() => tokens.verifyRefreshToken(token)).toThrow();
  });

  it('farkli secret ile imzalanan token dogrulanamaz', () => {
    const other = createTokenService({
      JWT_ACCESS_SECRET: 'baska-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
    });
    const token = other.signAccessToken({
      sub: 'u1',
      tenantId: 't1',
      roleIds: ['r1'],
      isPlatformAdmin: false,
    });
    expect(() => tokens.verifyAccessToken(token)).toThrow();
  });
});
