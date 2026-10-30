import { inject, Injectable } from '@angular/core';
import { isActive, Router } from '@angular/router';
import { DirectCallService } from './direct-call.service';
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
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly voiceRoomRouteActive = isActive('/voice-room', this.router, {
    paths: 'subset',
    queryParams: 'ignored',
    fragment: 'ignored',
    matrixParams: 'ignored',
  });

  /**
   * User hangup. Leaves `/voice-room/:id` for `/` before the session ends, so
   * navigation is not lost when the voice-room view is destroyed mid-leave.
   */
  public async leaveFromVoiceUi(): Promise<void> {
    if (this.voiceRoomRouteActive()) {
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
