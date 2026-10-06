import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { selectRoomsDict } from '../rooms.selectors';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { TuiButton, TuiGroup, TuiHint } from '@taiga-ui/core';
import { RoomsActions } from '../rooms.actions';
import { Router } from '@angular/router';
import { DirectCallService } from '@core/services/direct-call.service';
import { EVoiceSessionType } from '@konvoez/shared';

@Component({
  selector: 'app-voice-room-panel',
  imports: [TranslatePipe, TuiGroup, TuiButton, TuiHint],
  templateUrl: './voice-room-panel.component.html',
  styleUrl: './voice-room-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomPanelComponent {
  private readonly router = inject(Router);
  private readonly store = inject(Store);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly voiceAudioPreferencesStore = inject(
    VoiceAudioPreferencesStore,
  );
  private readonly voiceLeaveService = inject(VoiceLeaveService);
  private readonly directCallService = inject(DirectCallService);
  private readonly translateService = inject(TranslateService);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly voiceSessionService = inject(VoiceSessionService);

  public readonly collapsed = input.required<boolean>();

  protected readonly microphoneMuted =
    this.voiceAudioPreferencesStore.microphoneMuted;
  protected readonly speakerMuted =
    this.voiceAudioPreferencesStore.speakerMuted;

  protected readonly cameraOn = computed(
    () => this.peerVideoService.localCamTrack() !== null,
  );
  protected readonly screenOn = computed(
    () => this.peerVideoService.localScreenTrack() !== null,
  );

  protected readonly isDirectCall = this.directCallService.isDirectCallContext;

  protected readonly isSessionActive = computed(() => {
    const session = this.activeSession();
    const isCallActive = this.directCallService.isCallActive();
    return session !== null || isCallActive;
  });

  protected readonly sessionTitle = computed(() => {
    const isDirectCall = this.isDirectCall();
    const session = this.activeSession();
    const rooms = this.rooms();

    if (isDirectCall) {
      return this.translateService.instant('CALL.DIRECT_CALL');
    }
    if (session?.type === EVoiceSessionType.GROUP_ROOM) {
      return rooms[session.roomId]?.name ?? '';
    }
    return '';
  });

  private readonly rooms = this.store.selectSignal(selectRoomsDict);
  private readonly activeSession = this.voiceSessionStore.activeSession;

  protected clickSession(): void {
    if (this.isDirectCall()) {
      const userId = this.directCallService.callWithUserId();
      if (userId !== null) {
        void this.router.navigate(['/direct', userId]);
      }
      return;
    }

    const session = this.activeSession();
    if (session?.type === EVoiceSessionType.GROUP_ROOM) {
      const room = this.rooms()[session.roomId];
      if (room) {
        this.store.dispatch(RoomsActions.selectRoom({ room }));
      }
    }
  }

  protected leaveSession(): void {
    void this.voiceLeaveService.leaveActiveVoice();
  }

  protected toggleMicrophoneMuted(): void {
    this.voiceAudioPreferencesStore.toggleMicrophoneMuted();
  }

  protected toggleSpeakerMuted(): void {
    this.voiceAudioPreferencesStore.toggleSpeakerMuted();
  }

  protected stopCamera(): void {
    void this.voiceSessionService.stopCamera();
  }

  protected stopScreen(): void {
    void this.voiceSessionService.stopScreen();
  }
}
