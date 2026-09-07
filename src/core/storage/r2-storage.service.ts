import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../errors/app.exception';

/**
 * Cloudflare R2 (S3-uyumlu) uzerinde nesne depolama. Su an tek kullanicisi
 * urun gorselleri (Faz 11i, U1) - anahtar sablonu PILENS/{env}/{tenantId}/... .
 * Bucket herkese acik okumaya izin verecek sekilde yapilandirilmali
 * (R2_PUBLIC_BASE_URL o public erisim noktasini gosterir).
 */
@Injectable()
export class R2StorageService {
  private client: S3Client | null = null;
  private bucket: string | null = null;
  private publicBaseUrl: string | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      const accountId = this.config.get<string>('R2_ACCOUNT_ID');
      const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
      const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
      const bucket = this.config.get<string>('R2_BUCKET_NAME');
      const publicBaseUrl = this.config.get<string>('R2_PUBLIC_BASE_URL');
      if (
        !accountId ||
        !accessKeyId ||
        !secretAccessKey ||
        !bucket ||
        !publicBaseUrl
      ) {
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
      this.publicBaseUrl = publicBaseUrl.replace(/\/+$/, '');
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

  getPublicUrl(key: string): string {
    this.getClient();
    return `${this.publicBaseUrl}/${key}`;
  }
}
