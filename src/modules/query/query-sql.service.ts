import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect, type RawBuilder, sql } from 'kysely';
import { Pool, types } from 'pg';

// count()/count(distinct) postgres'te bigint (OID 20) doner; pg varsayilan
// olarak bunu string'e cevirir (64bit hassasiyet kaybi riskine karsi).
// Agregasyon sonuclari QueryResult'ta NUMBER olarak sozlesildigi icin
// (CLAUDE.md SS6) burada number'a ceviriyoruz.
types.setTypeParser(20, (value: string) => Number.parseInt(value, 10));

/**
 * Sorgu motoru icin ayri pool: RawSqlService'in pool'undan farkli olarak
 * zorunlu statement_timeout (CLAUDE.md SS6, 15sn) ve Europe/Istanbul zaman
 * dilimi (date_trunc icin) baglanti aciliminda ayarlanir. Ingest/COPY
 * islemleri bu timeout'a tabi olmamali, bu yuzden pool paylasilmiyor.
 */
type AnyDb = Record<string, never>;

@Injectable()
export class QuerySqlService implements OnModuleDestroy {
  readonly db: Kysely<AnyDb>;
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: 5,
      options: '-c statement_timeout=15000 -c TimeZone=Europe/Istanbul',
    });
    this.db = new Kysely<AnyDb>({
      dialect: new PostgresDialect({ pool: this.pool }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }

  async execute<T = Record<string, unknown>>(
    query: RawBuilder<T>,
  ): Promise<T[]> {
    const result = await query.execute(this.db);
    return result.rows;
  }
}

export { sql };
