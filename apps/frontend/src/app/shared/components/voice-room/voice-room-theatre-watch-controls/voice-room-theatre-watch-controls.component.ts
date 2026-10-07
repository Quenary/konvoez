import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  TuiButton,
  TuiDropdown,
  TuiGroup,
  TuiHint,
  TuiLabel,
  TuiSlider,
} from '@taiga-ui/core';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceRoomActionsService } from '../voice-room-actions.service';

@Component({
  selector: 'app-voice-room-theatre-watch-controls',
  imports: [
    FormsModule,
    TuiButton,
    TuiDropdown,
    TuiGroup,
    TuiHint,
    TuiLabel,
    TuiSlider,
    TranslatePipe,
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

  public readonly userId = input<number | null>(null);

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

  protected onScreenVolumeChange(value: number): void {
    const id = this.userId();
    if (id == null) {
      return;
    }
    this.voiceAudioPreferencesStore.setPeerScreenGain(id, value / 100);
  }
}
