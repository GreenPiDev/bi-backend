import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../../core/errors/app.exception';
import { ChatbotService } from './chatbot.service';

const TENANT_ID = 'tenant-1';
const USER = {
  id: 'u1',
  tenantId: TENANT_ID,
  role: 'EDITOR' as const,
  isPlatformAdmin: false,
};

function textCompletion(content: string) {
  return {
    choices: [
      { message: { role: 'assistant', content, tool_calls: undefined } },
    ],
  };
}

function toolCallCompletion(
  name: string,
  args: Record<string, unknown>,
  id = 'call_1',
) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

function createPrisma() {
  return {
    dataset: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Satis',
          fields: [
            {
              name: 'tutar',
              label: 'Tutar',
              type: 'NUMBER',
              role: 'MEASURE',
              isVisible: true,
            },
          ],
        },
      ]),
    },
    dashboard: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'db1', name: 'Satış Panosu' }]),
    },
  };
}

function createConfig(model = 'gpt-4o-mini') {
  return { get: vi.fn().mockReturnValue(model) };
}

describe('ChatbotService', () => {
  it('gecerli run_query tool-call ini dogru tenantId ile QueryService.runQuery e delege eder', async () => {
    const runQuery = vi.fn().mockResolvedValue({
      columns: [],
      rows: [],
      rowCount: 0,
      executionMs: 1,
      truncated: false,
    });
    const create = vi
      .fn()
      .mockResolvedValueOnce(
        toolCallCompletion('run_query', {
          datasetId: '11111111-1111-4111-8111-111111111111',
          measures: [{ field: 'tutar', agg: 'sum', alias: 'toplam' }],
          dimensions: [],
          filters: [],
          orderBy: [],
        }),
      )
      .mockResolvedValueOnce(textCompletion('Toplam 100 TL.'));

    const service = new ChatbotService(
      { chat: { completions: { create } } },
      createPrisma() as never,
      { runQuery } as never,
      createConfig() as never,
    );

    const result = await service.chat(
      { message: 'toplam satis ne kadar?', history: [] },
      USER,
    );

    expect(runQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: '11111111-1111-4111-8111-111111111111',
      }),
      TENANT_ID,
    );
    expect(result.reply).toBe('Toplam 100 TL.');
    expect(result.navigateTo).toBeNull();
  });

  it('gecersiz alan iceren tool-call istegi cokertmez, Turkce hata modele geri beslenir', async () => {
    const runQuery = vi
      .fn()
      .mockRejectedValue(
        new AppException('UNKNOWN_FIELD', 'Bilinmeyen alan.', 400),
      );
    const create = vi
      .fn()
      .mockResolvedValueOnce(
        toolCallCompletion('run_query', {
          datasetId: '11111111-1111-4111-8111-111111111111',
          measures: [{ field: 'yok', agg: 'sum', alias: 'toplam' }],
          dimensions: [],
          filters: [],
          orderBy: [],
        }),
      )
      .mockResolvedValueOnce(textCompletion('Bu alani bulamadim.'));

    const service = new ChatbotService(
      { chat: { completions: { create } } },
      createPrisma() as never,
      { runQuery } as never,
      createConfig() as never,
    );

    const result = await service.chat(
      { message: 'yok alanini topla', history: [] },
      USER,
    );

    expect(result.reply).toBe('Bu alani bulamadim.');
    const secondCallMessages = create.mock.calls[1][0].messages;
    const toolMessage = secondCallMessages.at(-2);
    expect(JSON.parse(toolMessage.content).error).toBe('Bilinmeyen alan.');
  });

  it('tur limiti asilirsa donguyu keser ve yedek cevabi doner', async () => {
    const create = vi
      .fn()
      .mockResolvedValue(
        toolCallCompletion('navigate', { intent: 'dashboards_list' }),
      );

    const service = new ChatbotService(
      { chat: { completions: { create } } },
      createPrisma() as never,
      { runQuery: vi.fn() } as never,
      createConfig() as never,
    );

    const result = await service.chat(
      { message: 'panolara git', history: [] },
      USER,
    );

    expect(create).toHaveBeenCalledTimes(5);
    expect(result.reply).toMatch(/yardımcı olamıyorum/i);
    expect(result.navigateTo).toBeNull();
  });

  it('navigate tool u sadece resolveNavigation uzerinden path uretir - VIEWER ayarlara gidemez', async () => {
    const viewer = { ...USER, role: 'VIEWER' as const };
    const create = vi
      .fn()
      .mockResolvedValueOnce(
        toolCallCompletion('navigate', { intent: 'settings' }),
      )
      .mockResolvedValueOnce(textCompletion('Ayarlara erisiminiz yok.'));

    const service = new ChatbotService(
      { chat: { completions: { create } } },
      createPrisma() as never,
      { runQuery: vi.fn() } as never,
      createConfig() as never,
    );

    const result = await service.chat(
      { message: 'ayarlara git', history: [] },
      viewer,
    );

    expect(result.navigateTo).toBeNull();
  });

  it('describe_dataset gecerli id icin alan listesini gercek adlarla doner', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(
        toolCallCompletion('describe_dataset', {
          datasetId: '11111111-1111-4111-8111-111111111111',
        }),
      )
      .mockResolvedValueOnce(
        textCompletion('Bu veri kumesinde tutar alani var.'),
      );

    const service = new ChatbotService(
      { chat: { completions: { create } } },
      createPrisma() as never,
      { runQuery: vi.fn() } as never,
      createConfig() as never,
    );

    const result = await service.chat(
      { message: 'satis veri kumesinde neler var?', history: [] },
      USER,
    );

    const secondCallMessages = create.mock.calls[1][0].messages;
    const toolMessage = secondCallMessages.at(-2);
    const parsed = JSON.parse(toolMessage.content);
    expect(parsed.fields).toEqual([
      { field: 'tutar', gorunenAdi: 'Tutar', tur: 'number', rol: 'measure' },
    ]);
    expect(result.reply).toBe('Bu veri kumesinde tutar alani var.');
  });

  it('describe_dataset bilinmeyen id icin hata doner, cokmez', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(
        toolCallCompletion('describe_dataset', {
          datasetId: 'yok-boyle-bir-id',
        }),
      )
      .mockResolvedValueOnce(
        textCompletion('Boyle bir veri kumesi bulamadim.'),
      );

    const service = new ChatbotService(
      { chat: { completions: { create } } },
      createPrisma() as never,
      { runQuery: vi.fn() } as never,
      createConfig() as never,
    );

    const result = await service.chat(
      { message: 'olmayan veri kumesi', history: [] },
      USER,
    );

    expect(result.reply).toBe('Boyle bir veri kumesi bulamadim.');
  });

  it('navigate tool u izinli intent te dogru pathi navigateTo olarak doner', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(
        toolCallCompletion('navigate', { intent: 'dashboards_list' }),
      )
      .mockResolvedValueOnce(textCompletion('Panolara yonlendiriyorum.'));

    const service = new ChatbotService(
      { chat: { completions: { create } } },
      createPrisma() as never,
      { runQuery: vi.fn() } as never,
      createConfig() as never,
    );

    const result = await service.chat(
      { message: 'panolara git', history: [] },
      USER,
    );

    expect(result.navigateTo).toBe('/dashboards');
  });
});
