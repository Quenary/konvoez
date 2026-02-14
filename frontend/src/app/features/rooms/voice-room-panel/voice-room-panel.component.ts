import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import {
  selectActiveVoiceChatId,
  selectActiveVoiceChatPeers,
} from '../../voice-chat/voice-chat.selectors';
import { selectRoomsDict } from '../rooms.selectors';
import { ButtonModule } from 'primeng/button';
import { VoiceChatActions } from '../../voice-chat/voice-chat.actions';
import { VoicePeerComponent } from '../../../shared/components/voice-peer/voice-peer.component';
import { MediaDevicesService } from '../../../core/services/media-devices.service';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-voice-room-panel',
  imports: [ButtonModule, VoicePeerComponent, SelectModule, FormsModule],
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
  private readonly activeRoomId = this.store.selectSignal(selectActiveVoiceChatId);

  protected readonly room = computed(() => {
    const rooms = this.rooms();
    const activeRoomId = this.activeRoomId();
    if (!activeRoomId) {
      return;
    }
    return rooms[activeRoomId];
  });
  protected readonly activePeers = this.store.selectSignal(selectActiveVoiceChatPeers);

  protected leaveRoom(id: number): void {
    this.store.dispatch(
      VoiceChatActions.leave({
        id,
      }),
    );
  }
}
