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
import type { TVoiceStreamKind } from './voice-peer-tiles';

export type TTheatreFocus = {
  peerId: number;
  stream: TVoiceStreamKind;
};

@Injectable({ providedIn: 'root' })
export class VoiceRoomViewService {
  private readonly store = inject(Store);
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly directCallService = inject(DirectCallService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly chrome = new VoiceChromeReveal(true);
  private readonly focus = signal<TTheatreFocus | null>(null);
  private readonly fullscreen = signal(false);
  private hostEl: HTMLElement | null = null;

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

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

    effect(() => {
      const focus = this.focus();
      const watching = this.peerVideoService.watchingUserIds();
      const peers = this.voiceRoomStore.peersList();
      const me = this.currentUser();
      const interlocutor = this.directCallService.interlocutor();
      const localCam = this.peerVideoService.localCamTrack();
      const localScreen = this.peerVideoService.localScreenTrack();
      const remoteCam = this.peerVideoService.remoteCamTracks();

      if (focus == null) {
        return;
      }

      const present =
        peers.some((peer) => peer.id === focus.peerId) ||
        me?.id === focus.peerId ||
        interlocutor?.id === focus.peerId;
      if (!present) {
        this.focus.set(null);
        return;
      }

      const isLocal = me?.id === focus.peerId;
      if (focus.stream === 'screen') {
        if (isLocal) {
          if (localScreen == null) {
            this.focus.set(null);
          }
          return;
        }
        if (!watching.has(focus.peerId)) {
          this.focus.set(null);
        }
        return;
      }

      if (isLocal) {
        if (localCam == null) {
          this.focus.set(null);
        }
        return;
      }

      if (remoteCam[focus.peerId] == null) {
        this.focus.set(null);
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

  public openTheatre(peerId: number, stream: TVoiceStreamKind): void {
    const me = this.currentUser();
    const watching = this.peerVideoService.watchingUserIds();
    const isLocal = me?.id === peerId;

    if (stream === 'screen') {
      if (isLocal) {
        if (this.peerVideoService.localScreenTrack() == null) {
          return;
        }
      } else if (!watching.has(peerId)) {
        return;
      }
    } else if (isLocal) {
      if (this.peerVideoService.localCamTrack() == null) {
        return;
      }
    } else if (this.peerVideoService.remoteCamTracks()[peerId] == null) {
      return;
    }

    this.focus.set({ peerId, stream });
    this.revealChrome();
  }

  public closeTheatre(): void {
    this.focus.set(null);
  }

  public readonly theatreShowsRemoteScreenWatchControls = computed(() => {
    const focus = this.focus();
    const me = this.currentUser();
    if (focus == null || focus.stream !== 'screen') {
      return false;
    }
    return me?.id !== focus.peerId;
  });

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

  public async stopWatchingFocus(): Promise<void> {
    const focus = this.focus();
    if (focus == null) {
      return;
    }
    await this.voiceSessionService.stopWatchingPeerScreen(focus.peerId);
  }
}
