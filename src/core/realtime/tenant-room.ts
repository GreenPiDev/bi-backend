export function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

/** Super admin (isPlatformAdmin) oturumlarinin ortak room'u - tenant'a bagli olmayan,
 * platform genelindeki olaylar (orn. yeni destek talebi) icin. */
export const PLATFORM_ADMIN_ROOM = 'platform-admins';
