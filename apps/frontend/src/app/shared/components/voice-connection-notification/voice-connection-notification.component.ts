import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
} from '@angular/core';
import { VoiceConnectionStore } from '@core/voice/voice-connection.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { EVoiceConnectionState } from '@konvoez/shared';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiNotification } from '@taiga-ui/core';
import { icons } from '@constants';

@Component({
  selector: 'app-voice-connection-notification',
  imports: [TuiButton, TuiNotification, TranslatePipe],
  templateUrl: './voice-connection-notification.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceConnectionNotificationComponent {
  private readonly voiceConnectionStore = inject(VoiceConnectionStore);
  private readonly voiceSessionService = inject(VoiceSessionService);

  protected readonly icons = icons;

  protected readonly show = linkedSignal(() =>
    this.voiceConnectionStore.lossReported(),
  );

  protected readonly state = this.voiceConnectionStore.state;

  protected readonly isDead = computed(
    () => this.state() === EVoiceConnectionState.DEAD,
  );

  protected readonly labelKey = computed(() => {
    const state = this.state();
    return state ? `CALL.CONNECTION.${state}` : '';
  });

  protected readonly appearance = computed(() => {
    return this.state() === EVoiceConnectionState.RECONNECTING
      ? 'warning'
      : 'negative';
  });

  protected rejoin(): void {
    void this.voiceSessionService.rejoin();
  }
}
