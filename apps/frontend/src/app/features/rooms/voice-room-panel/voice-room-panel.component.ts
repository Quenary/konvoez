import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { RoomsStore } from '@core/stores/rooms.store';
import { RoomNavigationService } from '../room-navigation.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { VoiceQualityService } from '@core/services/voice-quality.service';
import { TuiButton, TuiGroup, TuiHint, TuiIcon } from '@taiga-ui/core';
import { Router } from '@angular/router';
import { DirectCallService } from '@core/services/direct-call.service';
import { EVoiceQualityTier, EVoiceSessionType } from '@konvoez/shared';
import { TuiFade } from '@taiga-ui/kit';

import { icons } from '@constants';

@Component({
  selector: 'app-voice-room-panel',
  imports: [TranslatePipe, TuiGroup, TuiButton, TuiHint, TuiFade, TuiIcon],
  templateUrl: './voice-room-panel.component.html',
  styleUrl: './voice-room-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomPanelComponent {
  private readonly router = inject(Router);
  private readonly roomsStore = inject(RoomsStore);
  private readonly roomNavigationService = inject(RoomNavigationService);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly voiceAudioPreferencesStore = inject(
    VoiceAudioPreferencesStore,
  );
  private readonly voiceLeaveService = inject(VoiceLeaveService);
  private readonly directCallService = inject(DirectCallService);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly voiceQualityService = inject(VoiceQualityService);
  private readonly translateService = inject(TranslateService);

  protected readonly icons = icons;
  public readonly collapsed = input.required<boolean>();

  protected readonly microphoneMuted =
    this.voiceAudioPreferencesStore.microphoneMuted;
  protected readonly speakerMuted =
    this.voiceAudioPreferencesStore.speakerMuted;

  protected readonly micHintKey = computed(() =>
    this.microphoneMuted() ? 'CALL.UNMUTE_MICROPHONE' : 'CALL.MUTE_MICROPHONE',
  );
  protected readonly speakerHintKey = computed(() =>
    this.speakerMuted() ? 'CALL.UNMUTE_SPEAKER' : 'CALL.MUTE_SPEAKER',
  );

  protected readonly cameraOn = computed(
    () => this.peerVideoService.localCamTrack() !== null,
  );
  protected readonly screenOn = computed(
    () => this.peerVideoService.localScreenTrack() !== null,
  );

  protected readonly isDirectCall = this.directCallService.isDirectCallContext;

  protected readonly qualityTier = this.voiceQualityService.tier;
  protected readonly qualityBitrateKbps = this.voiceQualityService.bitrateKbps;

  protected readonly qualityColor = computed(() => {
    switch (this.qualityTier()) {
      case EVoiceQualityTier.EXCELLENT:
        return 'var(--tui-status-positive)';
      case EVoiceQualityTier.GOOD:
        return 'var(--tui-status-warning)';
      case EVoiceQualityTier.UNSTABLE:
        return 'var(--tui-chart-state-warning-accent, var(--tui-const-orange-darker-48, #f59200))';
      case EVoiceQualityTier.BAD:
        return 'var(--tui-status-negative)';
    }
  });

  protected readonly qualityHintKey = computed(() => {
    switch (this.qualityTier()) {
      case EVoiceQualityTier.EXCELLENT:
        return 'CALL.QUALITY.LEVEL_0';
      case EVoiceQualityTier.GOOD:
        return 'CALL.QUALITY.LEVEL_1';
      case EVoiceQualityTier.UNSTABLE:
        return 'CALL.QUALITY.LEVEL_2';
      case EVoiceQualityTier.BAD:
        return 'CALL.QUALITY.LEVEL_3';
    }
  });

  protected readonly qualityAriaLabel = computed(() => {
    const titleKey = this.sessionTitle();
    const hintKey = this.qualityHintKey();
    const kbps = this.qualityBitrateKbps();

    const qualityText = this.translateService.instant(hintKey, { kbps });
    if (titleKey) {
      const titleText = this.translateService.instant(titleKey);
      return `${titleText}. ${qualityText}`;
    }
    return qualityText;
  });

  protected readonly isSessionActive = computed(() => {
    const session = this.activeSession();
    const isConnected = this.directCallService.isConnected();
    return session !== null || isConnected;
  });

  protected readonly sessionTitle = computed(() => {
    const isDirectCall = this.isDirectCall();
    const session = this.activeSession();
    const rooms = this.rooms();

    if (isDirectCall) {
      return 'CALL.DIRECT_CALL';
    }
    if (session?.type === EVoiceSessionType.GROUP_ROOM) {
      return rooms[session.roomId]?.name ?? '';
    }
    return '';
  });

  private readonly rooms = this.roomsStore.roomsDict;
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
        this.roomNavigationService.selectRoom(room);
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

  protected openDevicesSettings(): void {
    void this.router.navigate(['/settings/devices']);
  }
}
