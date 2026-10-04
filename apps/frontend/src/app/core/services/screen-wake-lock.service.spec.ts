import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenWakeLockService } from './screen-wake-lock.service';

describe('ScreenWakeLockService', () => {
  let service: ScreenWakeLockService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ScreenWakeLockService],
    });
    service = TestBed.inject(ScreenWakeLockService);
  });

  it('requests screen wake lock when the API is available', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const addEventListener = vi.fn();
    const request = vi.fn().mockResolvedValue({
      release,
      addEventListener,
    });
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request },
      configurable: true,
    });

    await service.acquire();

    expect(request).toHaveBeenCalledWith('screen');
  });

  it('does not throw when screen wake lock API is unavailable', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: undefined,
      configurable: true,
    });

    await expect(service.acquire()).resolves.toBeUndefined();
  });

  it('releases an acquired sentinel', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const request = vi.fn().mockResolvedValue({
      release,
      addEventListener,
      removeEventListener,
    });
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request },
      configurable: true,
    });

    await service.acquire();
    service.release();

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases a sentinel that resolves after release()', async () => {
    let resolveRequest: (sentinel: WakeLockSentinel) => void = () => undefined;
    const release = vi.fn().mockResolvedValue(undefined);
    const addEventListener = vi.fn();
    const request = vi.fn(
      () =>
        new Promise<WakeLockSentinel>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request },
      configurable: true,
    });

    const pending = service.acquire();
    service.release();
    resolveRequest({
      release,
      addEventListener,
      removeEventListener: vi.fn(),
    } as unknown as WakeLockSentinel);
    await pending;

    expect(release).toHaveBeenCalledTimes(1);
    expect(service['screenWakeLock']).toBeNull();
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('requests the wake lock once when acquire overlaps', async () => {
    let resolveRequest: (sentinel: WakeLockSentinel) => void = () => undefined;
    const request = vi.fn(
      () =>
        new Promise<WakeLockSentinel>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request },
      configurable: true,
    });

    const first = service.acquire();
    const second = service.acquire();
    expect(request).toHaveBeenCalledTimes(1);

    resolveRequest({
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as WakeLockSentinel);
    await Promise.all([first, second]);

    expect(request).toHaveBeenCalledTimes(1);
  });
});
