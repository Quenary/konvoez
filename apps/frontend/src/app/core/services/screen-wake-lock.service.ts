import { Injectable } from '@angular/core';

/** Holds a Screen Wake Lock while a voice session is active; reacquires on visibility. */
@Injectable({
  providedIn: 'root',
})
export class ScreenWakeLockService {
  private screenWakeLock: WakeLockSentinel | null = null;
  private screenWakeLockOnRelease: (() => void) | null = null;
  private shouldHold = false;

  private readonly onDocumentVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this.shouldHold) {
      void this.acquire();
    }
  };

  constructor() {
    document.addEventListener(
      'visibilitychange',
      this.onDocumentVisibilityChange,
    );
  }

  public async acquire(): Promise<void> {
    this.shouldHold = true;
    const wakeLock = navigator.wakeLock;
    if (!wakeLock?.request) {
      return;
    }
    if (this.screenWakeLock) {
      return;
    }
    try {
      const sentinel = await wakeLock.request('screen');
      this.screenWakeLock = sentinel;
      const onRelease = (): void => {
        sentinel.removeEventListener('release', onRelease);
        if (this.screenWakeLockOnRelease === onRelease) {
          this.screenWakeLockOnRelease = null;
        }
        if (this.screenWakeLock === sentinel) {
          this.screenWakeLock = null;
        }
      };
      this.screenWakeLockOnRelease = onRelease;
      sentinel.addEventListener('release', onRelease);
    } catch (error) {
      console.error('Screen wake lock unavailable', error);
    }
  }

  public release(): void {
    this.shouldHold = false;
    const sentinel = this.screenWakeLock;
    const onRelease = this.screenWakeLockOnRelease;
    this.screenWakeLock = null;
    this.screenWakeLockOnRelease = null;
    if (!sentinel) {
      return;
    }
    if (onRelease) {
      sentinel.removeEventListener('release', onRelease);
    }
    void sentinel.release().catch(() => {
      // Sentinel may already be released by the browser.
    });
  }
}
