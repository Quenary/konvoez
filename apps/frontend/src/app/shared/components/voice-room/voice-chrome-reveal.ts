import { signal } from '@angular/core';
import { Subject, Subscription, switchMap, timer } from 'rxjs';

export const VOICE_CHROME_HIDE_MS = 2500;

export class VoiceChromeReveal {
  public readonly visible = signal(false);
  private readonly reveal$ = new Subject<void>();
  private readonly subscription: Subscription;

  constructor(
    initiallyVisible = false,
    private readonly hideMs = VOICE_CHROME_HIDE_MS,
  ) {
    this.subscription = this.reveal$
      .pipe(switchMap(() => timer(this.hideMs)))
      .subscribe(() => {
        this.visible.set(false);
      });
    if (initiallyVisible) {
      this.reveal();
    }
  }

  public reveal(): void {
    this.visible.set(true);
    this.reveal$.next();
  }

  public destroy(): void {
    this.subscription.unsubscribe();
    this.reveal$.complete();
  }
}
