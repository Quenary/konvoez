import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IUser } from '@konvoez/shared';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { DirectCallService } from '@core/services/direct-call.service';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import {
  TuiButton,
  TuiDropdown,
  TuiHint,
  TuiLabel,
  TuiSlider,
} from '@taiga-ui/core';
import { TuiAutoColorPipe, TuiBadge } from '@taiga-ui/kit';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-voice-peer-tile',
  imports: [
    FormsModule,
    UserAvatarComponent,
    TuiBadge,
    TuiButton,
    TuiDropdown,
    TuiHint,
    TuiLabel,
    TuiSlider,
    TuiAutoColorPipe,
    TranslatePipe,
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
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly peer = input.required<IUser>();
  public readonly videoTrack = input<MediaStreamTrack | null>(null);
  public readonly screenAvailable = input(false);
  public readonly watchingScreen = input(false);
  public readonly showingScreen = input(false);
  /** Screen share is live (available), even before watch — Discord-style LIVE. */
  public readonly screenLive = input(false);

  public readonly watchScreen = output<void>();
  public readonly stopWatchScreen = output<void>();

  private readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');

  constructor() {
    effect(() => {
      const el = this.videoEl()?.nativeElement;
      const track = this.videoTrack();
      if (!el) {
        return;
      }
      if (track) {
        const stream = el.srcObject;
        if (
          stream instanceof MediaStream &&
          stream.getVideoTracks()[0] === track
        ) {
          return;
        }
        el.srcObject = new MediaStream([track]);
        void el.play().catch(() => undefined);
      } else {
        el.srcObject = null;
      }
    });
  }

  protected readonly isLocal = computed(() => {
    const me = this.currentUser();
    const p = this.peer();
    return Boolean(me && p && me.id === p.id);
  });

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
    () => !this.isLocal() && this.screenAvailable(),
  );

  protected readonly showWatchButton = computed(
    () => this.showStreamRow() && !this.watchingScreen(),
  );

  protected readonly showStopWatchButton = computed(
    () => this.showStreamRow() && this.watchingScreen(),
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
}
