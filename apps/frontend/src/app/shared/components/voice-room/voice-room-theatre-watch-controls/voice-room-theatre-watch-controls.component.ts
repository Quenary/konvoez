import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
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
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { VoiceRoomViewService } from '../voice-room-view.service';

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
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly voiceRoomStore = inject(VoiceRoomStore);

  protected readonly screenVolume = computed(() => {
    const id = this.voiceRoomViewService.theatreFocusId();
    const levels = this.voiceRoomStore.peerScreenGainLevels();
    if (id == null) {
      return 100;
    }
    return Math.round((levels[id] ?? 1) * 100);
  });

  protected onStopWatch(): void {
    const id = this.voiceRoomViewService.theatreFocusId();
    if (id == null) {
      return;
    }
    void this.voiceSessionService.stopWatchingPeerScreen(id);
  }

  protected onScreenVolumeChange(value: number): void {
    const id = this.voiceRoomViewService.theatreFocusId();
    if (id == null) {
      return;
    }
    this.voiceRoomStore.setPeerScreenGain(id, value / 100);
  }
}
