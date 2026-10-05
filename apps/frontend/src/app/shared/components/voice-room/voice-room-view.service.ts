import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { fromEvent } from 'rxjs';
import { DirectCallService } from '@core/services/direct-call.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { VoiceChromeReveal } from './voice-chrome-reveal';

@Injectable({ providedIn: 'root' })
export class VoiceRoomViewService {
  private readonly store = inject(Store);
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly directCallService = inject(DirectCallService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly chrome = new VoiceChromeReveal(true);
  private readonly focusId = signal<number | null>(null);
  private readonly fullscreen = signal(false);
  private readonly fullscreenRoot = signal<HTMLElement | null>(null);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly chromeVisible = this.chrome.visible.asReadonly();
  public readonly theatreFocusId = this.focusId.asReadonly();
  public readonly theatreOpen = computed(() => this.focusId() != null);
  public readonly isFullscreen = this.fullscreen.asReadonly();

  constructor() {
    this.destroyRef.onDestroy(() => this.chrome.destroy());

    effect(() => {
      const id = this.focusId();
      const watching = this.peerVideoService.watchingUserIds();
      const peers = this.voiceRoomStore.peersList();
      const me = this.currentUser();
      const interlocutor = this.directCallService.interlocutor();
      if (id == null) {
        return;
      }
      const present =
        peers.some((peer) => peer.id === id) ||
        me?.id === id ||
        interlocutor?.id === id;
      if (!watching.has(id) || !present) {
        this.focusId.set(null);
      }
    });

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

  public setFullscreenRoot(element: HTMLElement | null): void {
    this.fullscreenRoot.set(element);
  }

  public openTheatre(userId: number): void {
    const me = this.currentUser();
    const watching = this.peerVideoService.watchingUserIds();
    if (me && me.id === userId) {
      return;
    }
    if (!watching.has(userId)) {
      return;
    }
    this.focusId.set(userId);
    this.revealChrome();
  }

  public closeTheatre(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen().finally(() => this.focusId.set(null));
      return;
    }
    this.focusId.set(null);
  }

  public async toggleFullscreen(target?: HTMLElement | null): Promise<void> {
    const element = target ?? this.fullscreenRoot();
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

  public async stopWatchingFocus(): Promise<void> {
    const id = this.focusId();
    if (id == null) {
      return;
    }
    await this.voiceSessionService.stopWatchingPeerScreen(id);
  }
}
