import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TVoiceRoomPeerUser } from '@konvoez/shared';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { ConsumerRegistry } from '@core/services/consumer-registry';
import { LocalScreenPreviewService } from '@core/services/local-screen-preview.service';
import {
  TViewerQualityMode,
  VIEWER_QUALITY_MODES,
} from '@core/services/remote-video-quality';
import { RemoteVideoViewService } from '@core/services/remote-video-view.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import {
  TuiButton,
  TuiCheckbox,
  TuiDataList,
  TuiDropdown,
  TuiGroup,
  TuiHint,
  TuiLabel,
  TuiOption,
} from '@taiga-ui/core';
import { TuiAutoColorPipe, TuiBadge } from '@taiga-ui/kit';
import { TranslatePipe } from '@ngx-translate/core';
import { VideoTrackDirective } from '@shared/directives/video-track.directive';
import { distinctFullname } from '../voice-peer-label';
import type { TVoiceStreamKind } from '../voice-room-tiles';
import { VoiceRoomActionsService } from '../voice-room-actions.service';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceRoomLocalScreenPreviewPauseButtonComponent } from '../voice-room-local-screen-preview-pause-button/voice-room-local-screen-preview-pause-button.component';
import { VolumeControlComponent } from '../../volume-control/volume-control.component';

import { icons } from '@constants';

@Component({
  selector: 'app-voice-room-tile',
  imports: [
    FormsModule,
    UserAvatarComponent,
    TuiBadge,
    TuiButton,
    TuiCheckbox,
    TuiDataList,
    TuiDropdown,
    TuiHint,
    TuiLabel,
    TuiOption,
    TuiAutoColorPipe,
    TranslatePipe,
    TuiGroup,
    VideoTrackDirective,
    VoiceRoomLocalScreenPreviewPauseButtonComponent,
    VolumeControlComponent,
  ],
  templateUrl: './voice-room-tile.component.html',
  styleUrl: './voice-room-tile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomTileComponent {
  private readonly store = inject(Store);
  private readonly voiceAudioPreferencesStore = inject(
    VoiceAudioPreferencesStore,
  );
  private readonly audioActivityService = inject(AudioActivityService);
  private readonly localScreenPreviewService = inject(
    LocalScreenPreviewService,
  );
  private readonly voiceRoomActionsService = inject(VoiceRoomActionsService);
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
  private readonly consumerRegistry = inject(ConsumerRegistry);
  private readonly remoteVideoViewService = inject(RemoteVideoViewService);

  protected readonly icons = icons;
  protected readonly modes = VIEWER_QUALITY_MODES;
  protected readonly layered = this.consumerRegistry.layered;
  protected readonly quality = this.remoteVideoViewService.quality;
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly peer = input.required<TVoiceRoomPeerUser>();
  public readonly streamKind = input<TVoiceStreamKind | null>(null);
  public readonly videoTrack = input<MediaStreamTrack | null>(null);
  public readonly screenAvailable = input(false);
  public readonly watchingScreen = input(false);
  public readonly previewPaused = input(false);

  protected readonly autoPauseWhenHidden =
    this.localScreenPreviewService.autoPauseWhenHidden;

  protected readonly isLocal = computed(() => {
    const me = this.currentUser();
    const p = this.peer();
    return Boolean(me && p && me.id === p.id);
  });

  protected readonly hintLabel = computed(() => distinctFullname(this.peer()));

  protected readonly streamKindLabelKey = computed(() => {
    const kind = this.streamKind();
    const local = this.isLocal();
    const screenAvailable = this.screenAvailable();
    if (local && kind === 'screen') {
      return 'CALL.YOUR_SCREEN';
    }
    if (local && kind === 'cam' && screenAvailable) {
      return 'CALL.CAMERA';
    }
    return null;
  });

  protected readonly isLocalScreenPreview = computed(
    () => this.isLocal() && this.streamKind() === 'screen',
  );

  protected readonly showingScreen = computed(
    () => this.streamKind() === 'screen' && this.videoTrack() !== null,
  );

  protected readonly isSpeaking = computed(() => {
    const speakingMap = this.audioActivityService.speakingMap();
    return Boolean(speakingMap[this.peer().id]);
  });

  protected readonly isMuted = computed(() => {
    const isLocal = this.isLocal();
    const microphoneMuted = this.voiceAudioPreferencesStore.microphoneMuted();
    const peerMuted = Boolean(this.peer().muted);
    return isLocal ? microphoneMuted : peerMuted;
  });

  protected readonly isDeafened = computed(() => {
    const isLocal = this.isLocal();
    const speakerMuted = this.voiceAudioPreferencesStore.speakerMuted();
    const peerDeafened = Boolean(this.peer().deafened);
    return isLocal ? speakerMuted : peerDeafened;
  });

  protected readonly volume = computed(() => {
    const levels = this.voiceAudioPreferencesStore.peerGainLevels();
    const gain = levels[this.peer().id] ?? 1;
    return Math.round(gain * 100);
  });

  protected readonly screenVolume = computed(() => {
    const levels = this.voiceAudioPreferencesStore.peerScreenGainLevels();
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

  protected readonly showPausePreviewButton = computed(
    () =>
      this.isLocalScreenPreview() &&
      this.videoTrack() !== null &&
      !this.previewPaused(),
  );

  protected readonly showInfoActions = computed(
    () => this.showPausePreviewButton() || !this.isLocal(),
  );

  protected onVolumeChange(value: number): void {
    this.voiceAudioPreferencesStore.setPeerGain(this.peer().id, value / 100);
  }

  protected onScreenVolumeChange(value: number): void {
    this.voiceAudioPreferencesStore.setPeerScreenGain(
      this.peer().id,
      value / 100,
    );
  }

  protected onWatchClick(): void {
    void this.voiceRoomActionsService.watchPeerScreen(this.peer().id);
  }

  protected onStopWatchClick(): void {
    void this.voiceRoomActionsService.stopWatchingPeerScreen(this.peer().id);
  }

  protected onQualitySelect(mode: TViewerQualityMode): void {
    this.remoteVideoViewService.setQuality(mode);
  }

  protected onOpenTheatreClick(): void {
    this.voiceRoomViewService.openTheatre(this.peer().id, this.streamKind());
  }

  protected onVideoActivate(): void {
    if (this.videoTrack() && !this.previewPaused()) {
      this.voiceRoomViewService.openTheatre(this.peer().id, this.streamKind());
    }
  }

  protected onResumePreview(): void {
    this.localScreenPreviewService.resume();
  }

  protected onAutoPauseWhenHiddenChange(enabled: boolean): void {
    this.localScreenPreviewService.setAutoPauseWhenHidden(enabled);
  }
}
