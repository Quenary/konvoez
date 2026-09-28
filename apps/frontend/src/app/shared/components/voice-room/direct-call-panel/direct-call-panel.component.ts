import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
} from '@angular/core';
import { VoicePeersGridComponent } from '../voice-peers-grid/voice-peers-grid.component';
import { VoiceControlsBarComponent } from '../voice-controls-bar/voice-controls-bar.component';
import { TuiTitle } from '@taiga-ui/core';
import { TuiAccordion } from '@taiga-ui/kit';
import { TranslatePipe } from '@ngx-translate/core';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceRoomService } from '@core/services/voice-room.service';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { resolveVoiceSessionPeers } from '../voice-session-peers';

@Component({
  selector: 'app-direct-call-panel',
  imports: [
    VoicePeersGridComponent,
    VoiceControlsBarComponent,
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
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly directCallService = inject(DirectCallService);
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected readonly participantsCount = computed(() => {
    const isCalling = this.directCallService.isCalling();
    const isIncoming = this.directCallService.isIncoming();
    return resolveVoiceSessionPeers({
      me: this.currentUser(),
      remotePeers: this.voiceRoomService.peersList(),
      session: this.voiceRoomService.activeSession(),
      isRinging: isCalling || isIncoming,
      interlocutor: this.directCallService.interlocutor(),
    }).length;
  });

  public readonly expanded = model(true);

  protected onHangup(): void {
    void this.voiceRoomService.leaveCurrent();
  }
}
