import {
  ChangeDetectionStrategy,
  Component,
  inject,
  model,
} from '@angular/core';
import { VoiceRoomGridComponent } from '../voice-room-grid/voice-room-grid.component';
import { VoiceRoomControlsBarComponent } from '../voice-room-controls-bar/voice-room-controls-bar.component';
import { TuiTitle } from '@taiga-ui/core';
import { TuiAccordion } from '@taiga-ui/kit';
import { TranslatePipe } from '@ngx-translate/core';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceSessionPeersService } from '../voice-session-peers.service';

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
  private readonly voiceLeaveService = inject(VoiceLeaveService);
  private readonly voiceSessionPeersService = inject(VoiceSessionPeersService);

  public readonly expanded = model(true);

  protected readonly participantsCount = this.voiceSessionPeersService.count;

  protected onHangup(): void {
    void this.voiceLeaveService.leaveActiveVoice();
  }
}
