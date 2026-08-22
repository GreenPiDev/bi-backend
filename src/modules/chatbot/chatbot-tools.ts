import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { NAVIGATION_INTENTS } from './chatbot-navigation';

/**
 * LLM'e verilen iki arac: run_query (mevcut QuerySpec seklini birebir
 * yansitir, CLAUDE.md SS6) ve navigate (sabit intent listesi, SS ilkesi:
 * path asla serbest metinden gelmez).
 */
export const CHATBOT_TOOLS: ChatCompletionTool[] = [
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
        'Kullaniciyi platform icinde bir sayfaya yonlendirmeyi onerir. Sadece kullanici acikca bir sayfaya gitmek istediginde cagir.',
      parameters: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: [...NAVIGATION_INTENTS] },
          targetName: {
            type: 'string',
            description:
              'dashboard_view/dataset_view icin hedefin adi (ornegin pano veya veri kumesi adi).',
          },
        },
        required: ['intent'],
      },
    },
  },
];
