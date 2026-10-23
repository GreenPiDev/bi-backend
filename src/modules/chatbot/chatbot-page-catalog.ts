/**
 * Chatbot'un bilebilecegi tum sayfalar/tab'lar/durum filtreleri icin TEK kaynak.
 * app-shell.tsx'teki sidebar (canAccessPage/pageModuleAccess) ve ilgili *-management-page.tsx
 * bilesenlerindeki (orn. quote-management-page.tsx, inventory-management-page.tsx) erisim
 * mantigi burada BIREBIR yansitilir - yeni bir sayfa/tab eklenince hem orada hem burada
 * guncelleme gerekir (otomatik tek kaynak degil, cunku frontend route tablosu ile backend
 * chatbot katalogu ayri repolarda yasiyor).
 *
 * pageKeys: ANY'si VIEW+modul erisimine sahipse o giris erisilebilir sayilir (orn.
 * /siparisler sayfasi 'sales-orders' VEYA 'purchase-orders' izni olan herkese erisilebilir -
 * ayni OR mantigi orders-management-page.tsx'teki gibi).
 */

export interface ChatbotPageTab {
  key: string;
  label: string;
  pageKeys: string[];
  /** Bu tab'in sayfasinda zaten var olan ?status=... URL filtresi (bkz. quotes-list-page.tsx
   * ve benzerleri) - LLM sadece bu kapali kumeden secebilir, serbest metin asla path'e girmez. */
  statusValues?: readonly string[];
}

export interface ChatbotPageEntry {
  key: string;
  label: string;
  path: string;
  /** true ise izin/modul kontrolu atlanir (herkese acik - profil gibi). */
  alwaysVisible?: boolean;
  pageKeys?: string[];
  statusValues?: readonly string[];
  tabs?: readonly ChatbotPageTab[];
}

export const CHATBOT_PAGE_CATALOG: readonly ChatbotPageEntry[] = [
  { key: 'home', label: 'Ana Sayfa', path: '/anasayfa', alwaysVisible: true },
  {
    key: 'accounts',
    label: 'Firmalar',
    path: '/firmalar',
    pageKeys: ['accounts'],
  },
  {
    key: 'contacts',
    label: 'Kisiler',
    path: '/kisiler',
    pageKeys: ['contacts'],
  },
  {
    key: 'interactions',
    label: 'Gorusmeler',
    path: '/gorusmeler',
    pageKeys: ['interactions'],
    statusValues: ['OPEN', 'CLOSED'],
  },
  {
    key: 'calendar',
    label: 'Ajanda',
    path: '/ajanda',
    pageKeys: ['calendar'],
    tabs: [
      { key: 'calendar', label: 'Takvim', pageKeys: ['calendar'] },
      {
        key: 'sentInvites',
        label: 'Gonderdigim Davetler',
        pageKeys: ['calendar'],
      },
      {
        key: 'pendingInvites',
        label: 'Bekleyen Davetler',
        pageKeys: ['calendar'],
      },
    ],
  },
  {
    key: 'messages',
    label: 'Mesajlar',
    path: '/mesajlar',
    pageKeys: ['messages'],
  },
  {
    key: 'projects',
    label: 'Projeler',
    path: '/projeler',
    pageKeys: ['projects'],
  },
  {
    key: 'quotes',
    label: 'Teklifler',
    path: '/teklifler',
    pageKeys: ['quotes', 'quote-templates'],
    tabs: [
      {
        key: 'quotes',
        label: 'Teklifler',
        pageKeys: ['quotes'],
        statusValues: [
          'DRAFT',
          'SENT',
          'PENDING_APPROVAL',
          'APPROVED',
          'REJECTED',
          'REVIZE',
          'UNSPECIFIED',
        ],
      },
      { key: 'reports', label: 'Raporlar', pageKeys: ['quotes'] },
      { key: 'templates', label: 'Sablonlar', pageKeys: ['quote-templates'] },
    ],
  },
  {
    key: 'orders',
    label: 'Siparisler',
    path: '/siparisler',
    pageKeys: ['sales-orders', 'purchase-orders'],
    tabs: [
      {
        key: 'salesOrders',
        label: 'Satis Siparisleri',
        pageKeys: ['sales-orders'],
        statusValues: [
          'PENDING',
          'PROCESSING',
          'READY_FOR_SHIPMENT',
          'SHIPPED',
          'PARTIALLY_DELIVERED',
          'DELIVERED',
          'COMPLETED',
          'CANCELLED',
        ],
      },
      {
        key: 'purchaseOrders',
        label: 'Satin Alma Siparisleri',
        pageKeys: ['purchase-orders'],
        statusValues: [
          'DRAFT',
          'CONFIRMED',
          'PARTIALLY_RECEIVED',
          'FULLY_RECEIVED',
          'COMPLETED',
          'CANCELLED',
        ],
      },
    ],
  },
  {
    key: 'post-sale',
    label: 'Satis Sonrasi Destek',
    path: '/satis-sonrasi',
    pageKeys: ['post-sale-cases', 'surveys'],
    tabs: [
      { key: 'cases', label: 'Vakalar', pageKeys: ['post-sale-cases'] },
      { key: 'surveys', label: 'Anketler', pageKeys: ['surveys'] },
    ],
  },
  {
    key: 'opportunities',
    label: 'Firsatlar',
    path: '/firsatlar',
    pageKeys: ['opportunities'],
  },
  {
    key: 'inventory',
    label: 'Envanter',
    path: '/envanter',
    pageKeys: ['stock', 'product-lists', 'products', 'warehouses'],
    tabs: [
      { key: 'products', label: 'Urunler', pageKeys: ['products'] },
      {
        key: 'productLists',
        label: 'Urun Listeleri',
        pageKeys: ['product-lists'],
      },
      { key: 'stock', label: 'Stok', pageKeys: ['stock'] },
      { key: 'stockHistory', label: 'Stok Hareketleri', pageKeys: ['stock'] },
      {
        key: 'stockHoldingCostLog',
        label: 'Stok Tasima Maliyeti',
        pageKeys: ['stock'],
      },
      { key: 'priceHistory', label: 'Fiyat Gecmisi', pageKeys: ['products'] },
      { key: 'warehouses', label: 'Depolar', pageKeys: ['warehouses'] },
    ],
  },
  {
    key: 'reports',
    label: 'Raporlar',
    path: '/raporlar',
    pageKeys: ['reports'],
    tabs: [
      { key: 'accounts', label: 'Firmalar', pageKeys: ['reports'] },
      { key: 'contacts', label: 'Kisiler', pageKeys: ['reports'] },
      { key: 'interactions', label: 'Gorusmeler', pageKeys: ['reports'] },
      { key: 'projects', label: 'Projeler', pageKeys: ['reports'] },
      { key: 'quotes', label: 'Teklifler', pageKeys: ['reports'] },
      {
        key: 'purchaseOrders',
        label: 'Satin Alma Siparisleri',
        pageKeys: ['reports'],
      },
      { key: 'opportunities', label: 'Firsatlar', pageKeys: ['reports'] },
    ],
  },
  {
    key: 'drawing-settings',
    label: 'Cizim Ayarlari',
    path: '/cizim-ayarlari',
    pageKeys: ['drawing-library', 'drawing-templates'],
    tabs: [
      { key: 'drawings', label: 'Cizimler', pageKeys: ['drawings'] },
      { key: 'library', label: 'Kutuphane', pageKeys: ['drawing-library'] },
      {
        key: 'templates',
        label: 'Pano Sablonlari',
        pageKeys: ['drawing-templates'],
      },
    ],
  },
  {
    key: 'datasets',
    label: 'Veri Kumeleri',
    path: '/datasets',
    pageKeys: ['datasets'],
  },
  {
    key: 'dashboards',
    label: 'Panolar',
    path: '/dashboards',
    pageKeys: ['dashboards'],
  },
  {
    key: 'profile',
    label: 'Profil',
    path: '/profile',
    alwaysVisible: true,
    tabs: [
      { key: 'general', label: 'Genel', pageKeys: [] },
      { key: 'listSettings', label: 'Liste Ayarlari', pageKeys: [] },
      { key: 'security', label: 'Guvenlik', pageKeys: [] },
      { key: 'notifications', label: 'Bildirimler', pageKeys: [] },
    ],
  },
  {
    key: 'settings',
    label: 'Ayarlar',
    path: '/settings',
    pageKeys: ['settings'],
    tabs: [
      { key: 'general', label: 'Genel', pageKeys: ['settings'] },
      { key: 'crm', label: 'CRM Ayarlari', pageKeys: ['settings'] },
      { key: 'audit', label: 'Kullanici Aktiviteleri', pageKeys: ['settings'] },
      { key: 'roles', label: 'Roller', pageKeys: ['settings'] },
      { key: 'pageAccess', label: 'Sayfa Erisimleri', pageKeys: ['settings'] },
      {
        key: 'actionPermissions',
        label: 'Islem Izinleri',
        pageKeys: ['settings'],
      },
      { key: 'users', label: 'Kullanicilar', pageKeys: ['settings'] },
    ],
  },
] as const;

export function findChatbotPage(key: string): ChatbotPageEntry | undefined {
  return CHATBOT_PAGE_CATALOG.find((page) => page.key === key);
}
