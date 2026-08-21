import { describe, expect, it } from 'vitest';
import { splitSample } from './sample-rows';

async function* toAsync(rows: string[][]): AsyncGenerator<string[]> {
  for (const row of rows) {
    yield row;
  }
}

async function collect(rows: AsyncIterable<string[]>): Promise<string[][]> {
  const out: string[][] = [];
  for await (const row of rows) {
    out.push(row);
  }
  return out;
}

describe('splitSample', () => {
  it('returns the sample and replays it before the rest of the rows', async () => {
    const source = toAsync([['a'], ['b'], ['c'], ['d']]);
    const { sample, all } = await splitSample(source, 2);
    expect(sample).toEqual([['a'], ['b']]);
    expect(await collect(all)).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  it('handles a file with fewer rows than the sample size', async () => {
    const source = toAsync([['a'], ['b']]);
    const { sample, all } = await splitSample(source, 500);
    expect(sample).toEqual([['a'], ['b']]);
    expect(await collect(all)).toEqual([['a'], ['b']]);
  });

  it('handles an empty source', async () => {
    const source = toAsync([]);
    const { sample, all } = await splitSample(source, 500);
    expect(sample).toEqual([]);
    expect(await collect(all)).toEqual([]);
  });
});
