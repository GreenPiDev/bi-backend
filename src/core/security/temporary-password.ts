import { randomInt } from 'node:crypto';

/** Admin panelinde gosterilen tek kullanimlik gecici sifre - 6 haneli, sifirla
 * baslayabilen sayisal string (ornegin "048213"). */
export function generateTemporaryPassword(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
