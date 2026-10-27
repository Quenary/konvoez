import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AppResumeService } from './app-resume.service';

/** Resumes registered AudioContexts after a user click or app resume (autoplay / suspended policy). */
@Injectable({
  providedIn: 'root',
})
export class AudioContextResumeService {
  private readonly appResumeService = inject(AppResumeService);

  private readonly contexts = new Set<AudioContext>();
  private readonly contextListeners = new Map<AudioContext, () => void>();
  private readonly _suspended = signal(false);

  public readonly suspended = this._suspended.asReadonly();

  private readonly onClick = (): void => {
    this.resumeAll();
  };

  constructor() {
    window.addEventListener('click', this.onClick);
    this.appResumeService.resume$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.resumeAll();
    });
  }

  public register(context: AudioContext): void {
    this.contexts.add(context);
    const onStateChange = (): void => {
      this.updateSuspended();
      if (context.state === 'suspended' || context.state === 'interrupted') {
        void context.resume().catch(() => undefined);
      }
    };
    context.addEventListener('statechange', onStateChange);
    this.contextListeners.set(context, onStateChange);

    this.updateSuspended();
    if (context.state === 'suspended' || context.state === 'interrupted') {
      void context.resume().catch(() => undefined);
    }
  }

  public unregister(context: AudioContext): void {
    const listener = this.contextListeners.get(context);
    if (listener) {
      context.removeEventListener('statechange', listener);
      this.contextListeners.delete(context);
    }
    this.contexts.delete(context);
    this.updateSuspended();
  }

  private resumeAll(): void {
    for (const context of this.contexts) {
      if (context.state === 'suspended' || context.state === 'interrupted') {
        void context.resume().catch(() => undefined);
      }
    }
  }

  private updateSuspended(): void {
    const isAnySuspended = Array.from(this.contexts).some(
      (c) => c.state === 'suspended' || c.state === 'interrupted',
    );
    this._suspended.set(isAnySuspended);
  }
}
