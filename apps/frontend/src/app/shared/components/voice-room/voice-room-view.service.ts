import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { VoiceChromeReveal } from './voice-chrome-reveal';
import type { TVoiceStreamKind } from './voice-room-tiles';

export type TTheatreFocus = {
  peerId: number;
  stream: TVoiceStreamKind | null;
};

@Injectable({ providedIn: 'root' })
export class VoiceRoomViewService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly chrome = new VoiceChromeReveal(true);
  private readonly focus = signal<TTheatreFocus | null>(null);
  private readonly fullscreen = signal(false);
  private hostEl: HTMLElement | null = null;

  public readonly chromeVisible = this.chrome.visible.asReadonly();
  public readonly theatreFocus = this.focus.asReadonly();
  public readonly theatreFocusId = computed(() => this.focus()?.peerId ?? null);
  public readonly theatreFocusStream = computed(
    () => this.focus()?.stream ?? null,
  );
  public readonly theatreOpen = computed(() => this.focus() != null);
  public readonly isFullscreen = this.fullscreen.asReadonly();

  constructor() {
    this.destroyRef.onDestroy(() => this.chrome.destroy());

    fromEvent(document, 'fullscreenchange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.fullscreen.set(Boolean(document.fullscreenElement));
      });

    fromEvent<KeyboardEvent>(document, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.key === 'Escape' && !document.fullscreenElement) {
          this.closeTheatre();
        }
      });
  }

  public revealChrome(): void {
    this.chrome.reveal();
  }

  public attachHost(element: HTMLElement | null): void {
    if (
      element == null &&
      this.hostEl != null &&
      document.fullscreenElement === this.hostEl
    ) {
      void document.exitFullscreen();
    }
    this.hostEl = element;
  }

  public openTheatre(peerId: number, stream: TVoiceStreamKind | null): void {
    this.focus.set({ peerId, stream });
    this.revealChrome();
  }

  /**
   * Keeps theatre open and moves the focused tile when the previous one disappeared.
   * Does not reveal chrome: this is not a user gesture.
   */
  public retargetTheatre(
    peerId: number,
    stream: TVoiceStreamKind | null,
  ): void {
    const current = this.focus();
    if (
      current != null &&
      current.peerId === peerId &&
      current.stream === stream
    ) {
      return;
    }
    this.focus.set({ peerId, stream });
  }

  public closeTheatre(): void {
    this.focus.set(null);
  }

  public async toggleFullscreen(target?: HTMLElement | null): Promise<void> {
    const element = target ?? this.hostEl;
    if (!element) {
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen failed', error);
    }
  }
}
