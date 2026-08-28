/**
 * Her tenant'ta otomatik olusan iki sabit rolun adi. Bunlarin disindaki tum roller
 * COMPANYADMIN tarafindan serbestce olusturulan/silinen dinamik rollerdir - bu iki
 * sabit disinda hicbir rol ismi kod icinde gecmemelidir (bkz. CLAUDE.md SS0/SS16,
 * docs/PLAN_ROL_YONETIMI.md SS0). auth.service.ts (tenant kaydi) ve scripts/migrate-roles.ts
 * (eski veri gocu) bu sabitleri paylasir.
 */
export const COMPANY_ADMIN_ROLE_NAME = 'COMPANYADMIN';
export const BASIC_ROLE_NAME = 'Temel Kullanici';
