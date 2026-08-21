import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    // Every e2e file boots a full AppModule, including a BullMQ Worker on
    // the shared `ingest` queue against the real local Redis instance.
    // Running files in parallel lets one file's worker steal and process a
    // job enqueued by another file, sometimes after that file's app (and
    // its RawSqlService pg.Pool) has already been closed. Sequential
    // execution keeps at most one worker alive on the queue at a time.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
    },
  },
  plugins: [swc.vite()],
});
