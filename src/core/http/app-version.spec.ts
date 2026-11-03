import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppVersion } from './app-version';

describe('resolveAppVersion', () => {
  it('prefers the APP_VERSION env variable', () => {
    expect(resolveAppVersion({ APP_VERSION: 'v1' }, '/nonexistent')).toBe('v1');
  });

  it('reads the BUILD_ID file when env is not set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'build-id-'));
    writeFileSync(join(dir, 'BUILD_ID'), 'abc123\n');
    expect(resolveAppVersion({}, dir)).toBe('abc123');
  });

  it('falls back to "dev" when nothing is available', () => {
    expect(resolveAppVersion({}, '/nonexistent')).toBe('dev');
  });
});
