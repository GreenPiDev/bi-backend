import { execSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';

/**
 * Vitest globalSetup: e2e specler artik gelistirme veritabanina (pusula_bi)
 * ve gelistirme Redis'ine degil, bu dosyanin ayaga kaldirdigi tek kullanimlik
 * Postgres + Redis container'larina baglanir. Suite bitince ikisi de silinir,
 * hicbir kalici veri birikmez. CLAUDE.md SS11'in istedigi "Testcontainers ile
 * gercek Postgres" gerekliligini karsilar.
 *
 * Redis'in de container'a alinmasi sart: BullMQ worker'lari paylasilan gercek
 * Redis uzerinden kuyruk isimiyle eslesir. Gelistirme sunucusu (npm run dev)
 * calisirken e2e testleri gercek Redis'i kullansaydi, iki worker ayni "ingest"
 * kuyrugundaki job'lar icin yarisir; gelistirme sunucusunun worker'i job'i
 * kapip kendi (container olmayan) veritabaninda olmayan bir kaydi guncellemeye
 * calisinca "kayit bulunamadi" hatasiyla sessizce basarisiz olur.
 */
export default async function setup(): Promise<() => Promise<void>> {
  // Colima'nin Linux VM'i, Testcontainers'in reaper (Ryuk) sidecar'i icin
  // gerekli docker socket bind-mount'unu desteklemiyor ("operation not
  // supported"). Kendi teardown'imiz container'lari zaten durdurup sildigi
  // icin reaper'a ihtiyac yok.
  process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('pusula_bi_test')
      .withUsername('pusula_bi_test')
      .withPassword('pusula_bi_test')
      .start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  const databaseUrl = postgres.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redis.getConnectionUrl();

  execSync('npx prisma migrate deploy', {
    cwd: __dirname + '/../..',
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  return async () => {
    await Promise.all([postgres.stop(), redis.stop()]);
  };
}
