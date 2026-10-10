import {
  DestroyRef,
  effect,
  inject,
  Injectable,
  Injector,
} from '@angular/core';
import {
  EDesktopCommand,
  EEntitySyncEvent,
  type TPushNotificationPayload,
} from '@konvoez/shared';
import { EntitySyncSocketToken } from '@core/tokens/entity-sync-socket.token';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { getDesktopBridge } from './desktop-bridge';

@Injectable({ providedIn: 'root' })
export class DesktopBridgeService {
  private readonly bridge = getDesktopBridge();
  public readonly isDesktop = this.bridge !== null;

  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  /** Called from an app initializer only. Resolves voice deps lazily to stay a DI leaf. */
  public init(): void {
    const bridge = this.bridge;
    if (!bridge) {
      return;
    }
    const prefs = this.injector.get(VoiceAudioPreferencesStore);
    const session = this.injector.get(VoiceSessionStore);
    const voiceLeave = this.injector.get(VoiceLeaveService);
    const socket = this.injector.get(EntitySyncSocketToken);

    effect(
      () => {
        bridge.setVoiceState({
          inVoice: session.activeSession() !== null,
          micMuted: prefs.microphoneMuted(),
          speakerMuted: prefs.speakerMuted(),
        });
      },
      { injector: this.injector },
    );

    const onNotification = (payload: TPushNotificationPayload) => {
      bridge.notify(payload);
    };
    socket.on(EEntitySyncEvent.NOTIFICATION, onNotification);

    const off = bridge.onCommand(async (command) => {
      switch (command) {
        case EDesktopCommand.TOGGLE_MIC:
          prefs.toggleMicrophoneMuted();
          break;
        case EDesktopCommand.TOGGLE_SPEAKER:
          prefs.toggleSpeakerMuted();
          break;
        case EDesktopCommand.QUIT_REQUESTED:
          try {
            if (session.activeSession()) {
              await voiceLeave.leaveActiveVoice();
            }
          } catch {
            // Ignore error when leaving voice on quit
          } finally {
            bridge.quitReady();
          }
          break;
      }
    });

    this.destroyRef.onDestroy(() => {
      off();
      socket.off(EEntitySyncEvent.NOTIFICATION, onNotification);
    });
  }
}
