import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Store } from '@ngrx/store';
import {
  selectActiveVoiceRoomId,
  selectActiveVoiceRoomPeers,
  selectMicMuted,
  selectSoundMuted,
} from '../../voice-room/voice-room.selectors';
import { selectRoomsDict } from '../rooms.selectors';
import { ButtonModule } from 'primeng/button';
import { VoiceRoomActions } from '../../voice-room/voice-room.actions';
import { VoicePeerComponent } from '../../../shared/components/voice-peer/voice-peer.component';
import { MediaDevicesService } from '../../../core/services/media-devices.service';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { ButtonGroupModule } from 'primeng/buttongroup';

@Component({
  selector: 'app-voice-room-panel',
  imports: [
    ButtonModule,
    VoicePeerComponent,
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
  private readonly mediaDevicesService = inject(MediaDevicesService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);

  private readonly rooms = this.store.selectSignal(selectRoomsDict);
  private readonly activeRoomId = this.store.selectSignal(
    selectActiveVoiceRoomId,
  );

  protected readonly micMuted = this.store.selectSignal(selectMicMuted);
  protected readonly soundMuted = this.store.selectSignal(selectSoundMuted);
  protected readonly room = computed(() => {
    const rooms = this.rooms();
    const activeRoomId = this.activeRoomId();
    if (!activeRoomId) {
      return;
    }
    return rooms[activeRoomId];
  });
  protected readonly activePeers = this.store.selectSignal(
    selectActiveVoiceRoomPeers,
  );

  protected leaveRoom(id: number): void {
    this.store.dispatch(
      VoiceRoomActions.leave({
        id,
      }),
    );
  }

  protected toggleMicMuted(): void {
    const micMuted = !this.micMuted();
    this.store.dispatch(
      VoiceRoomActions.setMicMuted({
        micMuted,
      }),
    );
  }

  protected toggleSoundMuted(): void {
    const soundMuted = !this.soundMuted();
    this.store.dispatch(
      VoiceRoomActions.setSoundMuted({
        soundMuted,
      }),
    );
  }
}
