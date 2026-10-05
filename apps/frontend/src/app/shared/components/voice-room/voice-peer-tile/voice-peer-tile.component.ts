import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { IUser } from '@konvoez/shared';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { DirectCallService } from '@core/services/direct-call.service';
import { SettingsStore } from '@features/settings/settings.store';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import {
  TuiButton,
  TuiCheckbox,
  TuiDropdown,
  TuiGroup,
  TuiHint,
  TuiLabel,
  TuiSlider,
} from '@taiga-ui/core';
import { TuiAutoColorPipe, TuiBadge } from '@taiga-ui/kit';
import { TranslatePipe } from '@ngx-translate/core';
import type { TVoiceStreamKind } from '../voice-peer-tiles';
import {
  combineLatest,
  distinctUntilChanged,
  fromEvent,
  map,
  merge,
  of,
  switchMap,
  timer,
} from 'rxjs';

const PREVIEW_PAUSE_MS = 5_000;

@Component({
  selector: 'app-voice-peer-tile',
  imports: [
    FormsModule,
    UserAvatarComponent,
    TuiBadge,
    TuiButton,
    TuiCheckbox,
    TuiDropdown,
    TuiHint,
    TuiLabel,
    TuiSlider,
    TuiAutoColorPipe,
    TranslatePipe,
    TuiGroup,
  ],
  templateUrl: './voice-peer-tile.component.html',
  styleUrl: './voice-peer-tile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoicePeerTileComponent {
  private readonly store = inject(Store);
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly audioActivityService = inject(AudioActivityService);
  private readonly directCallService = inject(DirectCallService);
  private readonly settingsStore = inject(SettingsStore);
  private readonly destroyRef = inject(DestroyRef);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly peer = input.required<IUser>();
  public readonly streamKind = input<TVoiceStreamKind | null>(null);
  public readonly videoTrack = input<MediaStreamTrack | null>(null);
  public readonly screenAvailable = input(false);
  public readonly watchingScreen = input(false);

  public readonly watchScreen = output<void>();
  public readonly stopWatchScreen = output<void>();
  public readonly openTheatre = output<void>();

  protected readonly previewPaused = signal(false);
  protected readonly autoPauseWhenHidden =
    this.settingsStore.screenPreviewAutoPauseWhenHidden;

  private readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');

  protected readonly isLocal = computed(() => {
    const me = this.currentUser();
    const p = this.peer();
    return Boolean(me && p && me.id === p.id);
  });

  protected readonly isLocalScreenPreview = computed(
    () => this.isLocal() && this.streamKind() === 'screen',
  );

  protected readonly showingScreen = computed(
    () => this.streamKind() === 'screen' && this.videoTrack() !== null,
  );

  protected readonly showLocalScreenPreviewControls = computed(
    () => this.isLocalScreenPreview() && this.videoTrack() !== null,
  );

  constructor() {
    const visibilityHidden$ = merge(
      fromEvent(document, 'visibilitychange'),
      of(null),
    ).pipe(
      map(() => document.visibilityState === 'hidden'),
      distinctUntilChanged(),
    );

    const windowFocused$ = merge(
      fromEvent(window, 'focus').pipe(map(() => true)),
      fromEvent(window, 'blur').pipe(map(() => false)),
      of(typeof document !== 'undefined' ? document.hasFocus() : true),
    ).pipe(distinctUntilChanged());

    const previewContextInactive$ = combineLatest([
      visibilityHidden$,
      windowFocused$,
    ]).pipe(
      map(([hidden, focused]) => hidden || !focused),
      distinctUntilChanged(),
    );

    combineLatest([
      previewContextInactive$,
      toObservable(this.autoPauseWhenHidden),
      toObservable(this.videoTrack),
      toObservable(this.streamKind),
      toObservable(this.isLocal),
    ])
      .pipe(
        switchMap(([inactive, autoPause, track, kind, isLocal]) => {
          const isLocalScreen = isLocal && kind === 'screen' && track != null;
          if (!inactive || !autoPause || !isLocalScreen) {
            return of(null);
          }
          return timer(PREVIEW_PAUSE_MS);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (!this.isLocalScreenPreview()) {
          return;
        }
        if (
          this.isPreviewContextInactive() &&
          this.videoTrack() &&
          this.autoPauseWhenHidden()
        ) {
          this.previewPaused.set(true);
        }
      });

    effect(() => {
      const el = this.videoEl()?.nativeElement;
      const track = this.videoTrack();
      const paused = this.previewPaused();
      const localScreenPreview = this.isLocalScreenPreview();

      if (!el) {
        return;
      }

      if (!track || (localScreenPreview && paused)) {
        el.srcObject = null;
        return;
      }

      const stream = el.srcObject;
      if (
        stream instanceof MediaStream &&
        stream.getVideoTracks()[0] === track
      ) {
        void el.play()?.catch(() => undefined);
        return;
      }
      el.srcObject = new MediaStream([track]);
      void el.play()?.catch(() => undefined);
    });

    effect(() => {
      const track = this.videoTrack();
      const kind = this.streamKind();
      if (!this.isLocal() || kind !== 'screen' || track == null) {
        this.previewPaused.set(false);
      }
    });
  }

  protected readonly isCalling = computed(() => {
    const isLocal = this.isLocal();
    const isCalling = this.directCallService.isCalling();
    return !isLocal && isCalling;
  });

  protected readonly isSpeaking = computed(() => {
    const speakingMap = this.audioActivityService.speakingMap();
    return Boolean(speakingMap[this.peer().id]);
  });

  protected readonly isMuted = computed(() => {
    const isLocal = this.isLocal();
    const microphoneMuted = this.voiceRoomStore.microphoneMuted();
    return isLocal ? microphoneMuted : false;
  });

  protected readonly isDeafened = computed(() => {
    const isLocal = this.isLocal();
    const speakerMuted = this.voiceRoomStore.speakerMuted();
    return isLocal ? speakerMuted : false;
  });

  protected readonly volume = computed(() => {
    const levels = this.voiceRoomStore.peerGainLevels();
    const gain = levels[this.peer().id] ?? 1;
    return Math.round(gain * 100);
  });

  protected readonly screenVolume = computed(() => {
    const levels = this.voiceRoomStore.peerScreenGainLevels();
    const gain = levels[this.peer().id] ?? 1;
    return Math.round(gain * 100);
  });

  protected readonly volumeIcon = computed(() => {
    const volume = this.volume();
    if (volume === 0) {
      return '@tui.volume-off';
    }
    if (volume < 50) {
      return '@tui.volume-1';
    }
    return '@tui.volume-2';
  });

  protected readonly showStreamRow = computed(
    () =>
      !this.isLocal() &&
      this.streamKind() === 'screen' &&
      this.screenAvailable(),
  );

  protected readonly showWatchButton = computed(
    () => this.showStreamRow() && !this.watchingScreen(),
  );

  protected readonly showStopWatchButton = computed(
    () => this.showStreamRow() && this.watchingScreen(),
  );

  protected readonly videoClickable = computed(
    () => this.videoTrack() !== null && !this.previewPaused(),
  );

  protected onVolumeChange(value: number): void {
    this.voiceRoomStore.setPeerGain(this.peer().id, value / 100);
  }

  protected onScreenVolumeChange(value: number): void {
    this.voiceRoomStore.setPeerScreenGain(this.peer().id, value / 100);
  }

  protected onWatchClick(): void {
    this.watchScreen.emit();
  }

  protected onStopWatchClick(): void {
    this.stopWatchScreen.emit();
  }

  protected onOpenTheatreClick(): void {
    this.openTheatre.emit();
  }

  protected onVideoActivate(): void {
    if (this.videoTrack() && !this.previewPaused()) {
      this.openTheatre.emit();
    }
  }

  protected onResumePreview(): void {
    this.previewPaused.set(false);
  }

  protected onAutoPauseWhenHiddenChange(enabled: boolean): void {
    this.settingsStore.setScreenPreviewAutoPauseWhenHidden(enabled);
    if (!enabled) {
      this.previewPaused.set(false);
    }
  }

  private isPreviewContextInactive(): boolean {
    return document.visibilityState === 'hidden' || !document.hasFocus();
  }
}
