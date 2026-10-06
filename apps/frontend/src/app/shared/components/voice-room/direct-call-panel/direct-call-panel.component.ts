import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
} from '@angular/core';
import { VoiceRoomGridComponent } from '../voice-room-grid/voice-room-grid.component';
import { VoiceRoomControlsBarComponent } from '../voice-room-controls-bar/voice-room-controls-bar.component';
import { TuiTitle } from '@taiga-ui/core';
import { TuiAccordion } from '@taiga-ui/kit';
import { TranslatePipe } from '@ngx-translate/core';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { resolveVoiceSessionPeers } from '../voice-session-peers';

@Component({
  selector: 'app-direct-call-panel',
  imports: [
    VoiceRoomGridComponent,
    VoiceRoomControlsBarComponent,
    TuiAccordion,
    TuiTitle,
    TranslatePipe,
  ],
  templateUrl: './direct-call-panel.component.html',
  styleUrl: './direct-call-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectCallPanelComponent {
  private readonly store = inject(Store);
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly voiceLeaveService = inject(VoiceLeaveService);
  private readonly directCallService = inject(DirectCallService);
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected readonly participantsCount = computed(() => {
    const isCalling = this.directCallService.isCalling();
    const isIncoming = this.directCallService.isIncoming();
    return resolveVoiceSessionPeers({
      me: this.currentUser(),
      remotePeers: this.voiceRoomStore.peersList(),
      session: this.voiceRoomStore.activeSession(),
      isRinging: isCalling || isIncoming,
      interlocutor: this.directCallService.interlocutor(),
    }).length;
  });

  public readonly expanded = model(true);

  protected onHangup(): void {
    void this.voiceLeaveService.leaveActiveVoice();
  }
}
