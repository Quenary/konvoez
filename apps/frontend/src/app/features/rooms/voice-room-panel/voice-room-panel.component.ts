import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { selectRoomsDict } from '../rooms.selectors';
import { TranslatePipe } from '@ngx-translate/core';
import { VoiceRoomService } from '@core/services/voice-room.service';
import { AudioService } from '@core/services/audio.service';
import { TuiButton, TuiGroup } from '@taiga-ui/core';
import { IRoom } from '../rooms.interface';
import { RoomsActions } from '../rooms.actions';

@Component({
  selector: 'app-voice-room-panel',
  imports: [TranslatePipe, TuiGroup, TuiButton],
  templateUrl: './voice-room-panel.component.html',
  styleUrl: './voice-room-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomPanelComponent {
  private readonly store = inject(Store);
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly audioService = inject(AudioService);

  public readonly collapsed = input.required<boolean>();

  protected readonly microphoneMuted = this.voiceRoomService.microphoneMuted;
  protected readonly speakerMuted = this.voiceRoomService.speakerMuted;
  protected readonly room = computed(() => {
    const rooms = this.rooms();
    const activeRoomId = this.activeRoomId();
    if (!activeRoomId) {
      return;
    }
    return rooms[activeRoomId];
  });

  private readonly rooms = this.store.selectSignal(selectRoomsDict);
  private readonly activeRoomId = this.voiceRoomService.selectedRoomId;

  protected clickRoom(): void {
    this.store.dispatch(
      RoomsActions.selectRoom({ room: this.room() as IRoom }),
    );
  }

  protected leaveRoom(): void {
    this.voiceRoomService.leaveRoom();
  }

  protected toggleMicrophoneMuted(): void {
    const microphoneMuted = !this.microphoneMuted();
    this.voiceRoomService.setMicrophoneMuted(microphoneMuted);
    if (!microphoneMuted) {
      this.voiceRoomService.setSpeakerMuted(false);
    }
    this.audioService.playMuteAudio();
  }

  protected toggleSpeakerMuted(): void {
    const speakerMuted = !this.speakerMuted();
    this.voiceRoomService.setSpeakerMuted(speakerMuted);
    if (speakerMuted) {
      this.voiceRoomService.setMicrophoneMuted(true);
    }
    this.audioService.playMuteAudio();
  }
}
