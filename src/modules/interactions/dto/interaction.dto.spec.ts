import { CreateInteractionSchema } from './interaction.dto';

describe('Interaction DTO', () => {
  const base = {
    type: 'CALL' as const,
    notes: 'Görüşme notu',
    occurredAt: '2026-01-01T10:00:00.000Z',
  };

  it('accountId ve accountName ikisi de eksikse hata verir', () => {
    const result = CreateInteractionSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it('accountId ve accountName ikisi de verilmisse hata verir', () => {
    const result = CreateInteractionSchema.safeParse({
      ...base,
      accountId: '11111111-1111-1111-8111-111111111111',
      accountName: 'Acme',
    });
    expect(result.success).toBe(false);
  });

  it('sadece accountId verilmisse gecerlidir', () => {
    const result = CreateInteractionSchema.safeParse({
      ...base,
      accountId: '11111111-1111-1111-8111-111111111111',
    });
    expect(result.success).toBe(true);
  });

  it('sadece accountName verilmisse gecerlidir (M2)', () => {
    const result = CreateInteractionSchema.safeParse({
      ...base,
      accountName: 'Bilinmeyen Firma',
    });
    expect(result.success).toBe(true);
  });

  it('contactId ve contactName ayni anda verilirse hata verir', () => {
    const result = CreateInteractionSchema.safeParse({
      ...base,
      accountId: '11111111-1111-1111-8111-111111111111',
      contactId: '11111111-1111-1111-8111-111111111111',
      contactName: 'Ahmet Yilmaz',
    });
    expect(result.success).toBe(false);
  });

  it('opportunity ve reminder alanlari opsiyoneldir', () => {
    const result = CreateInteractionSchema.safeParse({
      ...base,
      accountId: '11111111-1111-1111-8111-111111111111',
      opportunity: { name: 'Yeni sunucu ihtiyaci' },
      reminder: {
        startAt: '2027-01-01T10:00:00.000Z',
        assignees: [{ userId: '11111111-1111-1111-8111-111111111111' }],
      },
    });
    expect(result.success).toBe(true);
  });
});
