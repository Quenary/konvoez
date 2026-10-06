import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IUser } from '@konvoez/shared';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { LocalScreenPreviewService } from '@core/services/local-screen-preview.service';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { DirectCallService } from '@core/services/direct-call.service';
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
import { VideoTrackDirective } from '@shared/directives/video-track.directive';
import type { TVoiceStreamKind } from '../voice-room-tiles';

@Component({
  selector: 'app-voice-room-tile',
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
    VideoTrackDirective,
  ],
  templateUrl: './voice-room-tile.component.html',
  styleUrl: './voice-room-tile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomTileComponent {
  private readonly store = inject(Store);
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly audioActivityService = inject(AudioActivityService);
  private readonly directCallService = inject(DirectCallService);
  private readonly localScreenPreviewService = inject(
    LocalScreenPreviewService,
  );

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly peer = input.required<IUser>();
  public readonly streamKind = input<TVoiceStreamKind | null>(null);
  public readonly videoTrack = input<MediaStreamTrack | null>(null);
  public readonly screenAvailable = input(false);
  public readonly watchingScreen = input(false);

  public readonly watchScreen = output<void>();
  public readonly stopWatchScreen = output<void>();
  public readonly openTheatre = output<void>();

  protected readonly autoPauseWhenHidden =
    this.localScreenPreviewService.autoPauseWhenHidden;

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

  protected readonly previewPaused = computed(
    () =>
      this.isLocalScreenPreview() && this.localScreenPreviewService.paused(),
  );

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
    this.localScreenPreviewService.resume();
  }

  protected onAutoPauseWhenHiddenChange(enabled: boolean): void {
    this.localScreenPreviewService.setAutoPauseWhenHidden(enabled);
  }
}
