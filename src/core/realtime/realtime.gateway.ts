import type { OnGatewayConnection } from '@nestjs/websockets';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenService } from '../../modules/auth/token.service';
import { ACCESS_TOKEN_COOKIE } from '../../modules/auth/token.types';
import { tenantRoom } from './tenant-room';

/** cookie-parser'in kullandigi `cookie` paketi ESM-only oldugu icin CJS build'de
 * resolve edilemiyor - burada tek bir cookie degeri okumak icin harici bagimlilik
 * gerektirmeyen kucuk bir parser yeterli. */
function readCookieValue(
  cookieHeader: string,
  name: string,
): string | undefined {
  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }
  }
  return undefined;
}

/**
 * Generic server->client push kanali. Su an hicbir @SubscribeMessage handler'i yok, sadece
 * baglanti aninda JWT dogrulanip socket kendi tenant'inin room'una joinleniyor - bu yuzden
 * global APP_GUARD/APP_INTERCEPTOR'lar (JwtAuthGuard, PermissionGuard, ModuleGuard,
 * TenantContextInterceptor) devreye girmiyor, onlar sadece controller/@SubscribeMessage
 * handler'larini sarmaliyor, handleConnection gibi lifecycle hook'lari degil. Ileride
 * inbound mesaj (@SubscribeMessage) eklenirse bu guard'lar icin ayrica WS-context kontrolu
 * gerekecek.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(private readonly tokenService: TokenService) {}

  handleConnection(client: Socket): void {
    const cookieHeader = client.handshake.headers.cookie;
    const token = cookieHeader
      ? readCookieValue(cookieHeader, ACCESS_TOKEN_COOKIE)
      : undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      void client.join(tenantRoom(payload.tenantId));
    } catch {
      client.disconnect(true);
    }
  }
}
