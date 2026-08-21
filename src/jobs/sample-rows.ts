/**
 * Peeks up to `sampleSize` rows from an async iterable (for type inference)
 * without losing them for the downstream consumer — the sample is
 * re-yielded first, then the original iterator continues.
 */
export async function splitSample(
  rows: AsyncIterable<string[]>,
  sampleSize: number,
): Promise<{ sample: string[][]; all: AsyncIterable<string[]> }> {
  const iterator = rows[Symbol.asyncIterator]();
  const sample: string[][] = [];
  for (let i = 0; i < sampleSize; i++) {
    const { value, done } = await iterator.next();
    if (done) {
      break;
    }
    sample.push(value);
  }

  async function* all(): AsyncGenerator<string[]> {
    for (const row of sample) {
      yield row;
    }
    while (true) {
      const { value, done } = await iterator.next();
      if (done) {
        return;
      }
      yield value;
    }
  }

  return { sample, all: all() };
}
