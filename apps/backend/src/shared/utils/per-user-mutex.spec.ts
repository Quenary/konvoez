import { PerUserMutex } from './per-user-mutex';

describe('PerUserMutex', () => {
  it('runs calls for the same key in order', async () => {
    const mutex = new PerUserMutex();
    const order: number[] = [];

    const call1 = mutex.runExclusive(1, async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push(1);
      return 'first';
    });

    const call2 = mutex.runExclusive(1, async () => {
      order.push(2);
      return 'second';
    });

    const [res1, res2] = await Promise.all([call1, call2]);

    expect(order).toEqual([1, 2]);
    expect(res1).toBe('first');
    expect(res2).toBe('second');
  });

  it('runs calls for different keys concurrently', async () => {
    const mutex = new PerUserMutex();
    let activeCalls = 0;
    let maxConcurrent = 0;

    const task = async () => {
      activeCalls++;
      maxConcurrent = Math.max(maxConcurrent, activeCalls);
      await new Promise((resolve) => setTimeout(resolve, 30));
      activeCalls--;
    };

    await Promise.all([
      mutex.runExclusive(1, task),
      mutex.runExclusive(2, task),
    ]);

    expect(maxConcurrent).toBe(2);
  });

  it('does not block the next call when a preceding call rejects', async () => {
    const mutex = new PerUserMutex();

    const call1 = mutex.runExclusive(1, async () => {
      throw new Error('fail');
    });

    const call2 = mutex.runExclusive(1, async () => {
      return 'success';
    });

    await expect(call1).rejects.toThrow('fail');
    await expect(call2).resolves.toBe('success');
  });

  it('cleans up map entries when the queue finishes', async () => {
    const mutex = new PerUserMutex();

    await mutex.runExclusive(1, async () => 'done');

    expect(mutex['tails'].has(1)).toBe(false);
  });
});
