import { AppException } from '../../core/errors/app.exception';
import { AiLineMatcherService } from './ai-line-matcher.service';

function createOpenAiClient(content: string) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  };
}

function createConfig(values: Record<string, string> = {}) {
  return { get: vi.fn((key: string) => values[key]) };
}

describe('AiLineMatcherService', () => {
  it('gecerli JSON yaniti seme gore ayristirir', async () => {
    const openai = createOpenAiClient(
      JSON.stringify({
        lines: [
          {
            rawLine: 'ABB kesici - Adet: 2',
            panelGroupLabel: 'Pano 1',
            productId: '11111111-1111-4111-8111-111111111111',
            quantity: 2,
            confidence: 0.9,
          },
        ],
      }),
    );
    const service = new AiLineMatcherService(
      openai as never,
      createConfig() as never,
    );
    const result = await service.matchLines('pdf metni', [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Kesici', sku: null },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].productId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('gecersiz JSON donerse AI_RESPONSE_INVALID firlatir', async () => {
    const openai = createOpenAiClient('bu JSON degil');
    const service = new AiLineMatcherService(
      openai as never,
      createConfig() as never,
    );
    await expect(service.matchLines('pdf metni', [])).rejects.toMatchObject({
      code: 'AI_RESPONSE_INVALID',
    } satisfies Partial<AppException>);
  });

  it('semaya uymayan JSON donerse AI_RESPONSE_INVALID firlatir', async () => {
    const openai = createOpenAiClient(JSON.stringify({ lines: 'yanlis tip' }));
    const service = new AiLineMatcherService(
      openai as never,
      createConfig() as never,
    );
    await expect(service.matchLines('pdf metni', [])).rejects.toMatchObject({
      code: 'AI_RESPONSE_INVALID',
    } satisfies Partial<AppException>);
  });

  it('koordinat/geometri alani iceren bir satiri semadan disarida tutar (fazladan alanlar yok sayilir)', async () => {
    const openai = createOpenAiClient(
      JSON.stringify({
        lines: [
          {
            rawLine: 'ABB kesici',
            panelGroupLabel: 'Pano 1',
            productId: null,
            quantity: 1,
            confidence: 0.2,
            x: 100,
            y: 200,
            rotationDeg: 90,
          },
        ],
      }),
    );
    const service = new AiLineMatcherService(
      openai as never,
      createConfig() as never,
    );
    const result = await service.matchLines('pdf metni', []);
    expect(result[0]).not.toHaveProperty('x');
    expect(result[0]).not.toHaveProperty('y');
    expect(result[0]).not.toHaveProperty('rotationDeg');
  });
});
