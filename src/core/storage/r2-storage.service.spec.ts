import { ConfigService } from '@nestjs/config';
import { R2StorageService } from './r2-storage.service';

function createConfig(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

const FULL_CONFIG = {
  R2_ACCOUNT_ID: 'acc-1',
  R2_ACCESS_KEY_ID: 'key-1',
  R2_SECRET_ACCESS_KEY: 'secret-1',
  R2_BUCKET_NAME: 'pilens',
  R2_PUBLIC_BASE_URL: 'https://pub-example.r2.dev/',
};

describe('R2StorageService', () => {
  it('eksik ortam degiskeni varsa STORAGE_NOT_CONFIGURED firlatir', () => {
    const service = new R2StorageService(
      createConfig({ ...FULL_CONFIG, R2_ACCESS_KEY_ID: undefined }),
    );
    expect(() => service.getPublicUrl('some-key')).toThrowError(
      expect.objectContaining({ code: 'STORAGE_NOT_CONFIGURED' }),
    );
  });

  it('tum degiskenler tanimliysa herkese acik URL sondaki / karakterini temizler', () => {
    const service = new R2StorageService(createConfig(FULL_CONFIG));
    expect(service.getPublicUrl('foo/bar.png')).toBe(
      'https://pub-example.r2.dev/foo/bar.png',
    );
  });
});
