import { Global, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis-client.token';

/**
 * Sorgu motoru cache'i icin ayri bir ioredis client'i. BullMQ kendi
 * baglantisini kendi yonetir; onunla paylasmak ioredis'te onerilmez.
 */
class RedisClientHost extends Redis implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    this.disconnect();
  }
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) =>
        new RedisClientHost(config.getOrThrow<string>('REDIS_URL')),
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
