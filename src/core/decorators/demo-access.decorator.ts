import { SetMetadata } from '@nestjs/common';

export const ALLOW_EXPIRED_DEMO_KEY = 'allowExpiredDemo';
export const DEMO_RESTRICTED_KEY = 'demoRestricted';

/** Suresi dolmus bir demo kullanicisinin da cagirabilecegi uclar (orn. /auth/me,
 * /auth/logout) - bkz. DemoAccessGuard. */
export const AllowExpiredDemo = () => SetMetadata(ALLOW_EXPIRED_DEMO_KEY, true);

/** Ortak demo tenant'inda demo kullanicilarinin (COMPANYADMIN olsalar bile) cagiramayacagi
 * uclar: diger kullanicilari/rolleri yonetmek gibi, ayni tenant'i paylasan diger
 * ziyaretcileri ve asil demo yoneticisini etkileyebilecek islemler. */
export const DemoRestricted = () => SetMetadata(DEMO_RESTRICTED_KEY, true);
