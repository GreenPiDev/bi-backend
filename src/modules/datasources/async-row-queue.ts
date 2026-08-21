/**
 * A pull-based async queue used to bridge a push-style parser callback
 * (papaparse's `step`, exceljs's row events) with an `AsyncIterable`
 * consumer (the COPY stream writer), without buffering the whole file
 * in memory. `onPause`/`onResume` let the producer implement simple
 * high/low watermark backpressure.
 */
export class AsyncRowQueue<T> implements AsyncIterable<T> {
  private readonly buffer: T[] = [];
  private waiting: ((result: IteratorResult<T>) => void) | null = null;
  private closed = false;
  private failure: unknown = null;
  private pauseCallback: (() => void) | null = null;
  private resumeCallback: (() => void) | null = null;

  constructor(
    private readonly highWatermark = 2000,
    private readonly lowWatermark = 500,
  ) {}

  onPause(callback: () => void): void {
    this.pauseCallback = callback;
  }

  onResume(callback: () => void): void {
    this.resumeCallback = callback;
  }

  push(value: T): void {
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value, done: false });
      return;
    }
    this.buffer.push(value);
    if (this.buffer.length >= this.highWatermark) {
      this.pauseCallback?.();
    }
  }

  end(): void {
    this.closed = true;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: undefined as unknown as T, done: true });
    }
  }

  fail(error: unknown): void {
    this.failure = error;
    this.end();
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buffer.length > 0) {
          const value = this.buffer.shift() as T;
          if (this.buffer.length <= this.lowWatermark) {
            this.resumeCallback?.();
          }
          return Promise.resolve({ value, done: false });
        }
        if (this.closed) {
          if (this.failure) {
            return Promise.reject(this.failure as Error);
          }
          return Promise.resolve({
            value: undefined as unknown as T,
            done: true,
          });
        }
        return new Promise((resolve) => {
          this.waiting = resolve;
        });
      },
    };
  }
}
