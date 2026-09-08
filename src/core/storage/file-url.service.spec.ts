import { ConfigService } from '@nestjs/config';
import { FileUrlService } from './file-url.service';

function createConfig(apiPublicUrl: string | undefined) {
  return {
    getOrThrow: (key: string) => {
      if (key === 'API_PUBLIC_URL' && apiPublicUrl) return apiPublicUrl;
      throw new Error(`missing config: ${key}`);
    },
  } as unknown as ConfigService;
}

describe('FileUrlService', () => {
  it('key null ise null doner (config okunmaz)', () => {
    const service = new FileUrlService(createConfig(undefined));
    expect(service.build(null, new Date())).toBeNull();
  });

  it('key varsa /files proxy ucuna isaret eden ve ?v= cache-buster iceren URL doner', () => {
    const service = new FileUrlService(
      createConfig('http://localhost:3011/api/v1'),
    );
    const updatedAt = new Date('2026-09-08T06:00:00.000Z');
    expect(
      service.build('PILENS/development/t1/avatars/u1.png', updatedAt),
    ).toBe(
      'http://localhost:3011/api/v1/files?key=PILENS%2Fdevelopment%2Ft1%2Favatars%2Fu1.png&v=' +
        updatedAt.getTime(),
    );
  });

  it('API_PUBLIC_URL sonundaki / karakterlerini temizler', () => {
    const service = new FileUrlService(
      createConfig('http://localhost:3011/api/v1/'),
    );
    const updatedAt = new Date('2026-09-08T06:00:00.000Z');
    expect(service.build('k.png', updatedAt)).toBe(
      `http://localhost:3011/api/v1/files?key=k.png&v=${updatedAt.getTime()}`,
    );
  });
});
