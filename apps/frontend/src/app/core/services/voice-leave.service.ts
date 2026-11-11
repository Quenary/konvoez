import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { DirectCallService } from './direct-call.service';
import { VoiceRouteActiveService } from './voice-route-active.service';
import { VoiceSessionService } from './voice-session.service';

/**
 * UI hangup/leave: ends an active direct call if one exists, otherwise leaves the media session.
 */
@Injectable({
  providedIn: 'root',
})
export class VoiceLeaveService {
  private readonly router = inject(Router);
  private readonly directCallService = inject(DirectCallService);
  private readonly voiceRouteActiveService = inject(VoiceRouteActiveService);
  private readonly voiceSessionService = inject(VoiceSessionService);

  /**
   * User hangup. Leaves `/voice-room/:id` for `/` before the session ends, so
   * navigation is not lost when the voice-room view is destroyed mid-leave.
   * The voice-room list stays put.
   */
  public async leaveFromVoiceUi(): Promise<void> {
    if (this.voiceRouteActiveService.isRoom()) {
      void this.router.navigate(['/']);
    }
    await this.leaveActiveVoice();
  }

  public async leaveActiveVoice(): Promise<void> {
    if (this.directCallService.isCallActive()) {
      await this.directCallService.leaveCall();
      return;
    }
    await this.voiceSessionService.leaveSession();
  }
}
