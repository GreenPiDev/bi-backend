import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { resolveAppVersion } from './core/http/app-version';
import { createCorsOriginChecker } from './core/http/cors-origin';

const APP_VERSION = resolveAppVersion();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
