import { signal } from '@angular/core';

export const VOICE_CHROME_HIDE_MS = 2500;

export class VoiceChromeReveal {
  public readonly visible = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    initiallyVisible = false,
    private readonly hideMs = VOICE_CHROME_HIDE_MS,
  ) {
    if (initiallyVisible) {
      this.visible.set(true);
      this.scheduleHide();
    }
  }

  public reveal(): void {
    this.visible.set(true);
    this.scheduleHide();
  }

  public destroy(): void {
    this.clearTimer();
  }

  private scheduleHide(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.visible.set(false);
      this.timer = null;
    }, this.hideMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
