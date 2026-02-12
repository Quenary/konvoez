import { ChangeDetectionStrategy, Component, computed, ElementRef, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import {
  selectActiveVoiceChatId,
  selectActiveVoiceChatPeers,
} from '../../voice-chat/voice-chat.selectors';
import { selectRoomsDict } from '../rooms.selectors';
import { ButtonModule } from 'primeng/button';
import { VoiceChatActions } from '../../voice-chat/voice-chat.actions';
import { VoicePeerComponent } from '../../../shared/components/voice-peer/voice-peer.component';

@Component({
  selector: 'app-voice-room-panel',
  imports: [ButtonModule, VoicePeerComponent],
  templateUrl: './voice-room-panel.component.html',
  styleUrl: './voice-room-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomPanelComponent {
  private readonly store = inject(Store);
  private readonly hostRef = inject(ElementRef, { host: true });

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
