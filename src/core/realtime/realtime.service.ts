import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { PLATFORM_ADMIN_ROOM, tenantRoom } from './tenant-room';

/**
 * Generic tenant-scoped pub/sub katmani. Event adi ve payload sekli tamamen cagirana ait -
 * bu servis domain'den habersiz, sadece dogru room'a iletir.
 */
@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    this.gateway.server.to(tenantRoom(tenantId)).emit(event, payload);
  }

  /** Sadece super admin oturumlarina iletir (bkz. PLATFORM_ADMIN_ROOM). */
  emitToPlatformAdmins(event: string, payload: unknown): void {
    this.gateway.server.to(PLATFORM_ADMIN_ROOM).emit(event, payload);
  }

  /** Sayfa<->modul eslemesi gibi TUM tenant'lari etkileyen, tenant'a ozel olmayan
   * degisiklikler icin - baglanan her socket'e (hangi tenant'a ait olduguna bakmadan)
   * iletir. */
  emitToAll(event: string, payload: unknown): void {
    this.gateway.server.emit(event, payload);
  }
}
