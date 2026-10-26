export class PerUserMutex {
  private readonly tails = new Map<number, Promise<unknown>>();

  runExclusive<T>(key: number, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();

    const next = prev.then(
      () => fn(),
      () => fn(),
    );

    this.tails.set(key, next);

    const cleanup = () => {
      if (this.tails.get(key) === next) {
        this.tails.delete(key);
      }
    };

    next.then(cleanup, cleanup);

    return next;
  }
}
