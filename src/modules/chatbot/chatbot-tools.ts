import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { CHATBOT_PAGE_CATALOG } from './chatbot-page-catalog';
import { NAVIGATION_INTENTS } from './chatbot-navigation';

/**
 * LLM'in `navigate` aracina gonderdigi `tab`/`status` degerlerinin hangi
 * intent'lerde gecerli oldugunu aciklamaya yardimci - chatbot-page-catalog.ts'teki
 * katalogdan turetilir, elle tekrar yazilmaz.
 */
const TAB_HINTS = CHATBOT_PAGE_CATALOG.filter(
  (page) => page.tabs && page.tabs.length > 0,
)
  .map(
    (page) => `${page.key}: [${page.tabs!.map((tab) => tab.key).join(', ')}]`,
  )
  .join('; ');

const STATUS_HINTS = CHATBOT_PAGE_CATALOG.flatMap((page) => {
  const pageLevel = page.statusValues
    ? [`${page.key} -> [${page.statusValues.join(', ')}]`]
    : [];
  const tabLevel = (page.tabs ?? [])
    .filter((tab) => tab.statusValues)
    .map(
      (tab) => `${page.key}.${tab.key} -> [${tab.statusValues!.join(', ')}]`,
    );
  return [...pageLevel, ...tabLevel];
}).join('; ');

/**
 * LLM'e verilen uc arac: describe_dataset (tembel kesif - alan listesini
 * sadece istendiginde doner, prompt boyutu dataset sayisiyla degil sorgu
 * basina TEK dataset'in alan sayisiyla olcekleniyor), run_query (mevcut
 * QuerySpec seklini birebir yansitir, CLAUDE.md SS6) ve navigate (sabit
 * intent listesi, SS ilkesi: path asla serbest metinden gelmez).
 */
export const CHATBOT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'describe_dataset',
      description:
        'Bir veri kumesinin alanlarini (gercek ad, gorunen ad, tur, rol) getirir. run_query cagirmadan once, o dataset icin MUTLAKA once bunu cagir.',
      parameters: {
        type: 'object',
        properties: {
          datasetId: {
            type: 'string',
            description: 'Sistem promptundaki dataset id (uuid).',
          },
        },
        required: ['datasetId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_query',
      description:
        'Bu sirketin bir veri kumesi uzerinde toplama/gruplama sorgusu calistirir. Sadece sistem promptunda listelenen dataset id ve alan adlarini kullan.',
      parameters: {
        type: 'object',
        properties: {
          datasetId: {
            type: 'string',
            description: 'Sistem promptundaki dataset id (uuid).',
          },
          measures: {
            type: 'array',
            maxItems: 10,
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                agg: {
                  type: 'string',
                  enum: ['sum', 'avg', 'min', 'max', 'count', 'count_distinct'],
                },
                alias: {
                  type: 'string',
                  description:
                    'snake_case tanimlayici, sadece kucuk harf/rakam/alt cizgi, bosluk veya Turkce karakter YOK (ornegin "toplam_tutar", "musteri_sayisi").',
                },
              },
              required: ['field', 'agg', 'alias'],
            },
          },
          dimensions: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                granularity: {
                  type: 'string',
                  enum: ['day', 'week', 'month', 'quarter', 'year'],
                },
              },
              required: ['field'],
            },
          },
          filters: {
            type: 'array',
            maxItems: 20,
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                op: {
                  type: 'string',
                  enum: [
                    'eq',
                    'neq',
                    'in',
                    'nin',
                    'gt',
                    'gte',
                    'lt',
                    'lte',
                    'between',
                    'contains',
                    'is_null',
                    'is_not_null',
                  ],
                },
                value: {},
              },
              required: ['field', 'op'],
            },
          },
          orderBy: {
            type: 'array',
            maxItems: 3,
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                dir: { type: 'string', enum: ['asc', 'desc'] },
              },
              required: ['field', 'dir'],
            },
          },
          limit: { type: 'number' },
        },
        required: ['datasetId', 'measures', 'dimensions', 'filters', 'orderBy'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description:
        `Kullaniciyi platform icinde bir sayfaya (gerekirse bir sekmeye ve/veya durum ` +
        `filtresiyle) yonlendirmeyi onerir. Sadece kullanici acikca bir sayfaya gitmek ` +
        `istediginde veya belirli bir durumdaki kayitlari bir listede gormek istediginde cagir ` +
        `(orn. "revize durumundaki teklifleri goster" -> intent: "quotes", tab: "quotes", ` +
        `status: "REVIZE"). Hangi intent'in hangi tab'lari/durum degerlerini destekledigini ` +
        `ASAGIDAKI listelerden kontrol et, listede olmayan bir tab/durum degeri UYDURMA - ` +
        `sadece tab veya status alanini BOS BIRAK.\n` +
        `Gecerli tab'lar (intent -> [tab anahtarlari]): ${TAB_HINTS}\n` +
        `Gecerli durum degerleri (intent(.tab) -> [degerler]): ${STATUS_HINTS}`,
      parameters: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: [...NAVIGATION_INTENTS] },
          targetName: {
            type: 'string',
            description:
              'dashboard_view/dataset_view icin hedefin adi (ornegin pano veya veri kumesi adi).',
          },
          tab: {
            type: 'string',
            description:
              'Yukaridaki listede intent icin gecerli bir tab anahtari (ornegin "quotes" intent\'i icin "quotes"/"reports"/"templates"). Sayfa tab\'siz veya kullanici belirtmediyse bos birak.',
          },
          status: {
            type: 'string',
            description:
              'Yukaridaki listede intent (veya intent.tab) icin gecerli bir durum degeri (ornegin "REVIZE"). Kullanici bir durum belirtmediyse bos birak.',
          },
        },
        required: ['intent'],
      },
    },
  },
];
