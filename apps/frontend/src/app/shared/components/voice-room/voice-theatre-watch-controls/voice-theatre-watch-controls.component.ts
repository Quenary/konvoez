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
import { VoiceRoomViewService } from '../voice-room-view.service';

@Component({
  selector: 'app-voice-theatre-watch-controls',
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
  templateUrl: './voice-theatre-watch-controls.component.html',
  styleUrl: './voice-theatre-watch-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceTheatreWatchControlsComponent {
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
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
    void this.voiceRoomViewService.stopWatchingFocus();
  }

  protected onScreenVolumeChange(value: number): void {
    const id = this.voiceRoomViewService.theatreFocusId();
    if (id == null) {
      return;
    }
    this.voiceRoomStore.setPeerScreenGain(id, value / 100);
  }
}
