import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  TuiButton,
  TuiDataList,
  TuiDropdown,
  TuiGroup,
  TuiHint,
  TuiOption,
} from '@taiga-ui/core';
import { ConsumerRegistry } from '@core/services/consumer-registry';
import {
  TViewerQualityMode,
  VIEWER_QUALITY_MODES,
} from '@core/services/remote-video-quality';
import { RemoteVideoViewService } from '@core/services/remote-video-view.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceRoomActionsService } from '../voice-room-actions.service';
import { VolumeControlComponent } from '../../volume-control/volume-control.component';

import { icons } from '@constants';

@Component({
  selector: 'app-voice-room-theatre-watch-controls',
  imports: [
    TuiButton,
    TuiDataList,
    TuiDropdown,
    TuiGroup,
    TuiHint,
    TuiOption,
    TranslatePipe,
    VolumeControlComponent,
  ],
  templateUrl: './voice-room-theatre-watch-controls.component.html',
  styleUrl: './voice-room-theatre-watch-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomTheatreWatchControlsComponent {
  private readonly voiceRoomActionsService = inject(VoiceRoomActionsService);
  private readonly voiceAudioPreferencesStore = inject(
    VoiceAudioPreferencesStore,
  );
  private readonly consumerRegistry = inject(ConsumerRegistry);
  private readonly remoteVideoViewService = inject(RemoteVideoViewService);

  public readonly userId = input<number | null>(null);
  protected readonly icons = icons;
  protected readonly modes = VIEWER_QUALITY_MODES;
  protected readonly layered = this.consumerRegistry.layered;
  protected readonly quality = this.remoteVideoViewService.quality;

  protected readonly screenVolume = computed(() => {
    const id = this.userId();
    const levels = this.voiceAudioPreferencesStore.peerScreenGainLevels();
    if (id == null) {
      return 100;
    }
    return Math.round((levels[id] ?? 1) * 100);
  });

  protected onStopWatch(): void {
    const id = this.userId();
    if (id == null) {
      return;
    }
    void this.voiceRoomActionsService.stopWatchingPeerScreen(id);
  }

  protected onQualitySelect(mode: TViewerQualityMode): void {
    this.remoteVideoViewService.setQuality(mode);
  }

  protected onScreenVolumeChange(value: number): void {
    const id = this.userId();
    if (id == null) {
      return;
    }
    this.voiceAudioPreferencesStore.setPeerScreenGain(id, value / 100);
  }
}
