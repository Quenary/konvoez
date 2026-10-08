import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { getVoiceSessionKey } from '@konvoez/shared';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { fromEvent } from 'rxjs';
import { VoiceChromeReveal } from './voice-chrome-reveal';
import type { TVoiceStreamKind } from './voice-room-tiles';

export type TVoiceRoomLayout = 'grid' | 'theatre';

export type TTheatreFocus = {
  peerId: number;
  stream: TVoiceStreamKind | null;
};

@Injectable({ providedIn: 'root' })
export class VoiceRoomViewService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly voiceSessionStore = inject(VoiceSessionStore);

  private readonly chrome = new VoiceChromeReveal(true);
  private readonly layoutMode = signal<TVoiceRoomLayout>('grid');
  private readonly focus = signal<TTheatreFocus | null>(null);
  private readonly fullscreen = signal(false);
  /** Undefined until the first session read, so construction does not count as a change. */
  private sessionKey: string | null | undefined = undefined;

  public readonly chromeVisible = this.chrome.visible.asReadonly();
  public readonly layout = this.layoutMode.asReadonly();
  public readonly theatreFocus = this.focus.asReadonly();
  public readonly isFullscreen = this.fullscreen.asReadonly();

  constructor() {
    this.destroyRef.onDestroy(() => this.chrome.destroy());

    effect(() => {
      const session = this.voiceSessionStore.activeSession();
      const key = session ? getVoiceSessionKey(session) : null;
      if (this.sessionKey === undefined) {
        this.sessionKey = key;
        return;
      }
      if (this.sessionKey === key) {
        return;
      }
      this.sessionKey = key;
      this.resetView();
    });

    fromEvent(document, 'fullscreenchange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.fullscreen.set(Boolean(document.fullscreenElement));
      });
  }

  public revealChrome(): void {
    this.chrome.reveal();
  }

  public openTheatre(peerId: number, stream: TVoiceStreamKind | null): void {
    this.focus.set({ peerId, stream });
    this.layoutMode.set('theatre');
    this.revealChrome();
  }

  /** Switches to the grid. The theatre focus is kept for the next visit. */
  public showGrid(): void {
    this.layoutMode.set('grid');
  }

  public async toggleFullscreen(target: HTMLElement | null): Promise<void> {
    if (!target) {
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen failed', error);
    }
  }

  private resetView(): void {
    this.layoutMode.set('grid');
    this.focus.set(null);
  }
}
