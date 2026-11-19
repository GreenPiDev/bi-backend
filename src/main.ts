import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { resolveAppVersion } from './core/http/app-version';
import { createCorsOriginChecker } from './core/http/cors-origin';

const APP_VERSION = resolveAppVersion();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Express varsayilani 100kb - yuzlerce kalemli teklif gonderimi (gruplu Excel ice
  // aktarma, bkz. docs/VARSAYIMLAR.md V86) bu siniri asabiliyor.
  app.useBodyParser('json', { limit: '2mb' });
  app.use(helmet());
  app.use(cookieParser());
  app.use(
    (
      _req: unknown,
      res: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      res.setHeader('X-App-Version', APP_VERSION);
      next();
    },
  );
  app.enableCors({
    origin: createCorsOriginChecker(process.env.CORS_ORIGIN),
    credentials: true,
    exposedHeaders: ['X-App-Version'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
