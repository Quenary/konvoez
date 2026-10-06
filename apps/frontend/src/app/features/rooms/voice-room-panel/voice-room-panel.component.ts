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
import { AudioService } from '@core/services/audio.service';
import { TuiButton, TuiGroup } from '@taiga-ui/core';
import { RoomsActions } from '../rooms.actions';
import { Router } from '@angular/router';
import { DirectCallService } from '@core/services/direct-call.service';
import { EVoiceSessionType } from '@konvoez/shared';

@Component({
  selector: 'app-voice-room-panel',
  imports: [TranslatePipe, TuiGroup, TuiButton],
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
  private readonly audioService = inject(AudioService);
  private readonly translateService = inject(TranslateService);

  public readonly collapsed = input.required<boolean>();

  protected readonly microphoneMuted =
    this.voiceAudioPreferencesStore.microphoneMuted;
  protected readonly speakerMuted =
    this.voiceAudioPreferencesStore.speakerMuted;

  protected readonly isDirectCall = computed(() => {
    const session = this.activeSession();
    const isCalling = this.directCallService.isCalling();
    const isIncoming = this.directCallService.isIncoming();
    return (
      session?.type === EVoiceSessionType.DIRECT_CALL || isCalling || isIncoming
    );
  });

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
      const interlocutor = this.directCallService.interlocutor();
      if (interlocutor) {
        this.router.navigate(['/direct', interlocutor.id]);
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
    const microphoneMuted = !this.microphoneMuted();
    this.voiceAudioPreferencesStore.setMicrophoneMuted(microphoneMuted);
    if (!microphoneMuted) {
      this.voiceAudioPreferencesStore.setSpeakerMuted(false);
    }
    this.audioService.playMuteAudio();
  }

  protected toggleSpeakerMuted(): void {
    const speakerMuted = !this.speakerMuted();
    this.voiceAudioPreferencesStore.setSpeakerMuted(speakerMuted);
    if (speakerMuted) {
      this.voiceAudioPreferencesStore.setMicrophoneMuted(true);
    }
    this.audioService.playMuteAudio();
  }
}
