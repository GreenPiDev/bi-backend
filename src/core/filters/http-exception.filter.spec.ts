import { ArgumentsHost, ForbiddenException, HttpStatus } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { HttpExceptionFilter } from './http-exception.filter';

function createHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('AppException icin code/message/details doner', () => {
    const { host, status, json } = createHost();
    filter.catch(
      new AppException(
        'UNKNOWN_FIELD',
        'Alan bulunamadi.',
        HttpStatus.BAD_REQUEST,
        { field: 'x' },
      ),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'UNKNOWN_FIELD',
        message: 'Alan bulunamadi.',
        details: { field: 'x' },
      },
    });
  });

  it('yerlesik HttpException icin status koduna gore code uretir', () => {
    const { host, status, json } = createHost();
    filter.catch(new ForbiddenException('Yetkin yok.'), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'Yetkin yok.' },
    });
  });

  it('beklenmeyen hatada 500 INTERNAL_ERROR ve ham hata sizdirmaz', () => {
    const { host, status, json } = createHost();
    filter.catch(new Error('gizli stack trace bilgisi'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Beklenmeyen bir hata olustu.',
      },
    });
  });
});
