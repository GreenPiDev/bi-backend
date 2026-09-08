import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';
import { AppException } from '../errors/app.exception';

export interface DownloadedFile {
  body: Readable;
  contentType?: string;
  contentLength?: number;
}

/**
 * Cloudflare R2 (S3-uyumlu) uzerinde nesne depolama. Kullanicilari urun gorselleri
 * (Faz 11i, U1) ve kullanici avatari (Faz 11j, G2) - anahtar sablonu
 * PILENS/{env}/{tenantId}/... . Dosyalar R2'nin genel "Public Development URL"su
 * (`r2.dev`) uzerinden degil, `modules/files` altindaki proxy ucu araciligiyla servis
 * edilir - o URL'in SLA'siz/guvenilmez oldugu tespit edildi (bkz. docs/VARSAYIMLAR.md
 * V34), bu yuzden bucket'in genel okumaya acik olmasi da artik gerekmiyor.
 */
@Injectable()
export class R2StorageService {
  private client: S3Client | null = null;
  private bucket: string | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      const accountId = this.config.get<string>('R2_ACCOUNT_ID');
      const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
      const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
      const bucket = this.config.get<string>('R2_BUCKET_NAME');
      if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
        throw new AppException(
          'STORAGE_NOT_CONFIGURED',
          'Dosya depolama servisi yapilandirilmamis. Lutfen yonetici ile iletisime gecin.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.bucket = bucket;
    }
    return { client: this.client, bucket: this.bucket };
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    const { client, bucket } = this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    const { client, bucket } = this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async download(key: string): Promise<DownloadedFile> {
    const { client, bucket } = this.getClient();
    const result = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    return {
      body: result.Body as Readable,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
    };
  }
}
