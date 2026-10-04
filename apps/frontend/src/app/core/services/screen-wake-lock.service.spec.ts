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
});
