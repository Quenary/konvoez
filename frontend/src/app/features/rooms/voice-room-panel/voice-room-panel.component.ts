import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { selectRoomsDict } from '../rooms.selectors';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { ButtonGroupModule } from 'primeng/buttongroup';
import { VoiceRoomService } from '@core/services/voice-room.service';

@Component({
  selector: 'app-voice-room-panel',
  imports: [
    ButtonModule,
    SelectModule,
    FormsModule,
    ButtonGroupModule,
    TranslatePipe,
  ],
  templateUrl: './voice-room-panel.component.html',
  styleUrl: './voice-room-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomPanelComponent {
  private readonly store = inject(Store);
  private readonly voiceRoomService = inject(VoiceRoomService);

  private readonly rooms = this.store.selectSignal(selectRoomsDict);
  private readonly activeRoomId = this.voiceRoomService.selectedRoomId;

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

  protected leaveRoom(): void {
    this.voiceRoomService.leaveRoom();
  }

  protected toggleMicrophoneMuted(): void {
    const micMuted = !this.microphoneMuted();
    this.voiceRoomService.setMicrophoneMuted(micMuted);
  }

  protected toggleSpeakerMuted(): void {
    const speakerMuted = !this.speakerMuted();
    this.voiceRoomService.setSpeakerMuted(speakerMuted);
  }
}
