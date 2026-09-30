import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppException } from '../errors/app.exception';
import { REDIS_CLIENT } from '../redis/redis-client.token';

export interface FxRatesResult {
  base: string;
  asOf: string;
  /** Her key icin: 1 <key> = <deger> <base>. */
  rates: Record<string, number>;
}

const CACHE_TTL_SECONDS = 6 * 60 * 60;
const FETCH_TIMEOUT_MS = 5000;
const FRANKFURTER_BASE_URL = 'https://api.frankfurter.app/latest';

/**
 * Teklif para birimi cevrimi (bkz. Quote.quoteCurrency/exchangeRates) icin guncel kur
 * cekme servisi. Frankfurter.app (ECB verisi, ucretsiz, API anahtari gerekmez) kullanilir.
 * Kullanici kuru her zaman elle duzenleyebildigi icin (form alani editable) bu servis
 * sadece bir "otomatik on-doldurma" - basarisiz olursa kullanici manuel girer, bu yuzden
 * hata durumunda platformun geri kalani etkilenmez.
 */
@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private buildCacheKey(base: string, targets: string[]): string {
    return `fx:rates:${base}:${[...targets].sort().join(',')}`;
  }

  /** targets icindeki her para birimi icin "1 target = ? base" doner. base kendisi
   * targets'tan otomatik cikarilir. targets bossa API'ye hic gidilmez. */
  async getRatesToBase(
    base: string,
    targets: string[],
  ): Promise<FxRatesResult> {
    const uniqueTargets = [...new Set(targets)].filter((t) => t !== base);
    if (uniqueTargets.length === 0) {
      return { base, asOf: new Date().toISOString().slice(0, 10), rates: {} };
    }

    const cacheKey = this.buildCacheKey(base, uniqueTargets);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as FxRatesResult;
    }

    const result = await this.fetchFromFrankfurter(base, uniqueTargets);
    await this.redis.set(
      cacheKey,
      JSON.stringify(result),
      'EX',
      CACHE_TTL_SECONDS,
    );
    return result;
  }

  private async fetchFromFrankfurter(
    base: string,
    targets: string[],
  ): Promise<FxRatesResult> {
    const url = `${FRANKFURTER_BASE_URL}?from=${base}&to=${targets.join(',')}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Frankfurter HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        date: string;
        rates: Record<string, number>;
      };
      // Frankfurter "1 base = X target" doner, biz "1 target = ? base" istiyoruz.
      const rates: Record<string, number> = {};
      for (const target of targets) {
        const baseToTarget = data.rates[target];
        if (typeof baseToTarget === 'number' && baseToTarget > 0) {
          rates[target] = 1 / baseToTarget;
        }
      }
      return { base, asOf: data.date, rates };
    } catch (error) {
      this.logger.warn(
        `Kur cekilemedi (${base} <- ${targets.join(',')}): ${error}`,
      );
      throw new AppException(
        'FX_RATES_UNAVAILABLE',
        'Guncel kur bilgisi su anda alinamadi, lutfen kuru elle girin.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
