import type { Response } from 'express';
import { FilesController } from './files.controller';

function fakeResponse() {
  return {
    setHeader: vi.fn(),
  } as unknown as Response;
}

function createUser(tenantId: string) {
  return { id: 'u1', tenantId, roleIds: [], isPlatformAdmin: false } as never;
}

describe('FilesController', () => {
  it('key belirtilmezse FILE_REQUIRED firlatir', async () => {
    const storage = { download: vi.fn() };
    const controller = new FilesController(storage as never);
    await expect(
      controller.getFile(undefined, createUser('t1'), fakeResponse()),
    ).rejects.toMatchObject({ code: 'FILE_REQUIRED' });
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('anahtarin tenantId segmenti istegi yapanla eslesmezse NOT_FOUND firlatir (403 degil)', async () => {
    const storage = { download: vi.fn() };
    const controller = new FilesController(storage as never);
    await expect(
      controller.getFile(
        'PILENS/development/OTHER_TENANT/avatars/u1.png',
        createUser('t1'),
        fakeResponse(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('gecersiz anahtar sablonu (PILENS ile baslamayan) icin NOT_FOUND firlatir', async () => {
    const storage = { download: vi.fn() };
    const controller = new FilesController(storage as never);
    await expect(
      controller.getFile('../../etc/passwd', createUser('t1'), fakeResponse()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('gecerli anahtar icin dosyayi indirir, header set eder ve stream pipe eder', async () => {
    const pipe = vi.fn();
    const storage = {
      download: vi.fn().mockResolvedValue({
        body: { pipe },
        contentType: 'image/png',
        contentLength: 123,
      }),
    };
    const controller = new FilesController(storage as never);
    const res = fakeResponse();

    await controller.getFile(
      'PILENS/development/t1/avatars/u1.png',
      createUser('t1'),
      res,
    );

    expect(storage.download).toHaveBeenCalledWith(
      'PILENS/development/t1/avatars/u1.png',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '123');
    // Helmet'in varsayilan CORP:same-origin degeri farkli origin'deki (frontend) bir
    // <img>'in bu yaniti sessizce reddetmesine yol acardi - bkz. docs/VARSAYIMLAR.md V34.
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cross-Origin-Resource-Policy',
      'cross-origin',
    );
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it("R2'de bulunamayan bir anahtar icin NOT_FOUND firlatir", async () => {
    const storage = {
      download: vi.fn().mockRejectedValue(new Error('NoSuchKey')),
    };
    const controller = new FilesController(storage as never);
    await expect(
      controller.getFile(
        'PILENS/development/t1/avatars/yok.png',
        createUser('t1'),
        fakeResponse(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
