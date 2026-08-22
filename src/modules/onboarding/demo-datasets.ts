/**
 * Demo veri üreticileri. Deterministik (sabit tohumlu) sözde-rastgelelik
 * kullanır, böylece `npm run seed:demo` her çalıştırıldığında aynı veriyi
 * üretir ve sonuçlar tekrarlanabilir olur.
 */
function createRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function trNumber(value: number): string {
  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function trDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
}

function addDays(base: Date, days: number): Date {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toCsv(headers: string[], rows: string[][]): string {
  const escape = (value: string): string =>
    /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

const START_DATE = new Date('2026-01-05T00:00:00.000Z');

const CUSTOMER_NAMES = [
  'Ahmet Yılmaz',
  'Ayşe Şahin',
  'Mehmet Demir',
  'Zeynep Çelik',
  'Emre Kaya',
  'Elif Öztürk',
  'Can Aydın',
  'İrem Yıldız',
  'Barış Koç',
  'Selin Arslan',
  'Burak Güneş',
  'Deniz Aksoy',
];
const CITIES = [
  'İstanbul',
  'Ankara',
  'İzmir',
  'Bursa',
  'Antalya',
  'Adana',
  'Konya',
  'Gaziantep',
];
const PRODUCTS: { name: string; category: string; price: number }[] = [
  { name: 'Kahve Makinesi', category: 'Mutfak', price: 1234.5 },
  { name: 'Blender', category: 'Mutfak', price: 899.9 },
  { name: 'Ütü', category: 'Ev Aletleri', price: 649.0 },
  { name: 'Elektrikli Süpürge', category: 'Ev Aletleri', price: 2199.0 },
  { name: 'Kulaklık', category: 'Elektronik', price: 749.9 },
  { name: 'Akıllı Saat', category: 'Elektronik', price: 3499.0 },
  { name: 'Tost Makinesi', category: 'Mutfak', price: 549.9 },
  { name: 'Saç Kurutma Makinesi', category: 'Kişisel Bakım', price: 429.0 },
];

export function generateRetailCsv(rowCount = 180): string {
  const rng = createRng(42);
  const headers = [
    'Müşteri Adı',
    'Şehir',
    'Ürün',
    'Kategori',
    'Adet',
    'Birim Fiyat',
    'Toplam Tutar',
    'Satış Tarihi',
    'İade mi',
  ];
  const rows: string[][] = [];
  for (let i = 0; i < rowCount; i++) {
    const product = pick(rng, PRODUCTS);
    const quantity = 1 + Math.floor(rng() * 4);
    const total = product.price * quantity;
    const date = addDays(START_DATE, Math.floor(rng() * 178));
    rows.push([
      pick(rng, CUSTOMER_NAMES),
      pick(rng, CITIES),
      product.name,
      product.category,
      String(quantity),
      trNumber(product.price),
      trNumber(total),
      trDate(date),
      rng() < 0.08 ? 'Evet' : 'Hayır',
    ]);
  }
  return toCsv(headers, rows);
}

const CARGO_TYPES = ['Standart', 'Ekspres', 'Aynı Gün'];

export function generateLogisticsCsv(rowCount = 150): string {
  const rng = createRng(7);
  const headers = [
    'Gönderi No',
    'Alıcı İl',
    'Gönderi Türü',
    'Gönderi Tarihi',
    'Ağırlık (kg)',
    'Kargo Ücreti',
    'Teslim Edildi mi',
  ];
  const rows: string[][] = [];
  for (let i = 0; i < rowCount; i++) {
    const weight = Math.round((0.5 + rng() * 9.5) * 10) / 10;
    const fee = 19.9 + weight * 4.5;
    const date = addDays(START_DATE, Math.floor(rng() * 178));
    rows.push([
      `GN-${1000 + i}`,
      pick(rng, CITIES),
      pick(rng, CARGO_TYPES),
      trDate(date),
      trNumber(weight),
      trNumber(fee),
      rng() < 0.9 ? 'Evet' : 'Hayır',
    ]);
  }
  return toCsv(headers, rows);
}

const PATIENT_NAMES = [
  'İrem Yıldız',
  'Barış Koç',
  'Nazlı Er',
  'Kerem Polat',
  'Gizem Kurt',
  'Onur Bulut',
  'Sevgi Aktaş',
  'Tolga Şen',
];
const DEPARTMENTS: { name: string; doctor: string; price: number }[] = [
  { name: 'Göz Hastalıkları', doctor: 'Dr. Canan Güneş', price: 450 },
  { name: 'Kulak Burun Boğaz', doctor: 'Dr. Serkan Ünal', price: 350 },
  { name: 'Dahiliye', doctor: 'Dr. Pınar Doğan', price: 400 },
  { name: 'Ortopedi', doctor: 'Dr. Hakan Yıldırım', price: 500 },
  { name: 'Kardiyoloji', doctor: 'Dr. Elif Kaplan', price: 600 },
];

export function generateClinicCsv(rowCount = 120): string {
  const rng = createRng(99);
  const headers = [
    'Hasta Adı',
    'Doktor',
    'Bölüm',
    'Randevu Tarihi',
    'Ücret',
    'Ödendi mi',
  ];
  const rows: string[][] = [];
  for (let i = 0; i < rowCount; i++) {
    const dept = pick(rng, DEPARTMENTS);
    const date = addDays(START_DATE, Math.floor(rng() * 178));
    const hour = 9 + Math.floor(rng() * 8);
    const minute = rng() < 0.5 ? '00' : '30';
    rows.push([
      pick(rng, PATIENT_NAMES),
      dept.doctor,
      dept.name,
      `${trDate(date)} ${String(hour).padStart(2, '0')}:${minute}`,
      trNumber(dept.price),
      rng() < 0.85 ? 'Evet' : 'Hayır',
    ]);
  }
  return toCsv(headers, rows);
}
