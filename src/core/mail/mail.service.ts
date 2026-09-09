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
    await this.transporter.sendMail({
      from: this.config.get<string>(
        'MAIL_FROM',
        'PiLens <bildirim@pilens.local>',
      ),
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      text: input.text,
      attachments: input.attachments,
    });
  }
}
