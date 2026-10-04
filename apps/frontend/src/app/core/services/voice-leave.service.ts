import { inject, Injectable } from '@angular/core';
import { DirectCallService } from './direct-call.service';
import { VoiceSessionService } from './voice-session.service';

/**
 * UI hangup/leave: ends an active direct call if one exists, otherwise leaves the media session.
 */
@Injectable({
  providedIn: 'root',
})
export class VoiceLeaveService {
  private readonly directCallService = inject(DirectCallService);
  private readonly voiceSessionService = inject(VoiceSessionService);

  public async leaveActiveVoice(): Promise<void> {
    if (this.directCallService.isCallActive()) {
      await this.directCallService.leaveCall();
      return;
    }
    await this.voiceSessionService.leaveSession();
  }
}
