import { describe, expect, it } from 'vitest';
import { AsyncRowQueue } from './async-row-queue';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const value of iterable) {
    out.push(value);
  }
  return out;
}

describe('AsyncRowQueue', () => {
  it('yields values pushed before consumption starts', async () => {
    const queue = new AsyncRowQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.end();
    expect(await collect(queue)).toEqual([1, 2]);
  });

  it('yields values pushed after consumption has started (waiting consumer)', async () => {
    const queue = new AsyncRowQueue<number>();
    const resultPromise = collect(queue);
    queue.push(1);
    queue.push(2);
    queue.end();
    expect(await resultPromise).toEqual([1, 2]);
  });

  it('propagates a failure to the consumer', async () => {
    const queue = new AsyncRowQueue<number>();
    queue.push(1);
    queue.fail(new Error('boom'));
    await expect(collect(queue)).rejects.toThrow('boom');
  });

  it('invokes onPause once the high watermark is reached and onResume once drained', async () => {
    const queue = new AsyncRowQueue<number>(2, 0);
    let paused = false;
    let resumed = false;
    queue.onPause(() => {
      paused = true;
    });
    queue.onResume(() => {
      resumed = true;
    });
    queue.push(1);
    queue.push(2);
    expect(paused).toBe(true);
    queue.end();
    const results = await collect(queue);
    expect(results).toEqual([1, 2]);
    expect(resumed).toBe(true);
  });
});
