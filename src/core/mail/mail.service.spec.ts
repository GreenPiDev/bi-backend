import nodemailer from 'nodemailer';
import { MailService } from './mail.service';

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn() },
}));

function createConfig(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    SMTP_HOST: 'localhost',
    MAIL_FROM: '"PiLens" <bildirim@pilens.local>',
    ...overrides,
  };
  return {
    get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    getOrThrow: vi.fn((key: string) => values[key]),
  };
}

describe('MailService', () => {
  it('fromName verilmezse MAIL_FROM degismeden kullanilir', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);

    const service = new MailService(createConfig() as never);
    await service.send({
      to: ['x@example.com'],
      subject: 'Konu',
      text: 'Metin',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"PiLens" <bildirim@pilens.local>',
        replyTo: undefined,
      }),
    );
  });

  it('fromName verilince MAIL_FROM icindeki adres korunur, goruntulenen ad degisir', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);

    const service = new MailService(createConfig() as never);
    await service.send({
      to: ['x@example.com'],
      subject: 'Konu',
      text: 'Metin',
      fromName: 'ACME',
      replyTo: 'destek@acme.com',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"ACME" <bildirim@pilens.local>',
        replyTo: 'destek@acme.com',
      }),
    );
  });
});
