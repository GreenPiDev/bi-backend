import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendMailInput {
  to: string[];
  /** M4: sirket ici diger kisiler CC olarak eklenebilir. */
  cc?: string[];
  subject: string;
  text: string;
  attachments?: MailAttachment[];
  /**
   * Musteriye "A Sirketi'nden gelmis gibi" gorunmesi icin (kullanici talebi,
   * 2026-10-20) - gercek SMTP gonderici adresi degismez (deliverability/SPF/DKIM
   * icin platformun kendi dogrulanmis adresi kullanilir), sadece goruntulenen
   * gonderici ADI tenant'in sirket adiyla degistirilir. MAIL_FROM'daki email
   * kismi (<...>) korunur.
   */
  fromName?: string;
  /** Musteri "yanitla"ya basinca gidecek adres - tenant'in kendi Tenant.email'i
   * (bkz. TenantsService "Sirket Bilgileri"). Verilmezse SMTP gonderici adresine gider. */
  replyTo?: string;
}

@Injectable()
export class MailService {
  private readonly transporter: Transporter;

  constructor(private readonly config: ConfigService) {
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 1025),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async send(input: SendMailInput): Promise<void> {
    const defaultFrom = this.config.get<string>(
      'MAIL_FROM',
      'PiLens <bildirim@pilens.local>',
    );
    await this.transporter.sendMail({
      from: input.fromName
        ? this.withDisplayName(defaultFrom, input.fromName)
        : defaultFrom,
      replyTo: input.replyTo,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      text: input.text,
      attachments: input.attachments,
    });
  }

  /** `"Eski Ad" <adres@x.com>` veya cift tirnaksiz `adres@x.com` formatindaki
   * MAIL_FROM'dan sadece <...> icindeki (veya tirnaksiz ise tamamindaki) adresi
   * alip yeni goruntulenen adla birlestirir. */
  private withDisplayName(configuredFrom: string, displayName: string): string {
    const match = configuredFrom.match(/<([^>]+)>/);
    const address = match ? match[1] : configuredFrom.trim();
    return `"${displayName}" <${address}>`;
  }
}
