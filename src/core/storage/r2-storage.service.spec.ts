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
};

describe('R2StorageService', () => {
  it('eksik ortam degiskeni varsa STORAGE_NOT_CONFIGURED firlatir', async () => {
    const service = new R2StorageService(
      createConfig({ ...FULL_CONFIG, R2_ACCESS_KEY_ID: undefined }),
    );
    await expect(
      service.upload('some-key', Buffer.from(''), 'image/png'),
    ).rejects.toThrow(
      expect.objectContaining({ code: 'STORAGE_NOT_CONFIGURED' }),
    );
  });
});
