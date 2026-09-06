import type { Socket } from 'socket.io';
import type { TokenService } from '../../modules/auth/token.service';
import { ACCESS_TOKEN_COOKIE } from '../../modules/auth/token.types';
import { RealtimeGateway } from './realtime.gateway';

function createSocket(cookieHeader: string | undefined) {
  return {
    handshake: { headers: { cookie: cookieHeader } },
    join: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as Socket;
}

function createTokenService(verify: (token: string) => { tenantId: string }) {
  return { verifyAccessToken: vi.fn(verify) } as unknown as TokenService;
}

describe('RealtimeGateway.handleConnection', () => {
  it('cookie yoksa baglantiyi kapatir', () => {
    const tokenService = createTokenService(() => ({ tenantId: 't1' }));
    const gateway = new RealtimeGateway(tokenService);
    const socket = createSocket(undefined);

    gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('access_token cookie yoksa (baska cookieler varsa da) baglantiyi kapatir', () => {
    const tokenService = createTokenService(() => ({ tenantId: 't1' }));
    const gateway = new RealtimeGateway(tokenService);
    const socket = createSocket('other=abc; refresh_token=xyz');

    gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('token dogrulanamazsa baglantiyi kapatir', () => {
    const tokenService = createTokenService(() => {
      throw new Error('invalid');
    });
    const gateway = new RealtimeGateway(tokenService);
    const socket = createSocket(`${ACCESS_TOKEN_COOKIE}=gecersiz-token`);

    gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('gecerli token ile tenant room una joinler', () => {
    const tokenService = createTokenService(() => ({ tenantId: 'tenant-42' }));
    const gateway = new RealtimeGateway(tokenService);
    const socket = createSocket(
      `other=abc; ${ACCESS_TOKEN_COOKIE}=gecerli-token; refresh_token=xyz`,
    );

    gateway.handleConnection(socket);

    expect(tokenService.verifyAccessToken).toHaveBeenCalledWith(
      'gecerli-token',
    );
    expect(socket.join).toHaveBeenCalledWith('tenant:tenant-42');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});
