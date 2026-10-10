import {
  DestroyRef,
  effect,
  inject,
  Injectable,
  Injector,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import {
  EDesktopCommand,
  ENotificationsEvent,
  type TPushNotificationPayload,
} from '@konvoez/shared';
import { selectIsAuthorized } from '@core/auth/auth.selectors';
import { NotificationsSocketToken } from '@core/tokens/notifications-socket.token';
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

  /** Called from an app initializer only. Resolves voice and socket deps lazily to stay a DI leaf. */
  public init(): void {
    const bridge = this.bridge;
    if (!bridge) {
      return;
    }
    const prefs = this.injector.get(VoiceAudioPreferencesStore);
    const session = this.injector.get(VoiceSessionStore);
    const voiceLeave = this.injector.get(VoiceLeaveService);
    const socket = this.injector.get(NotificationsSocketToken);
    const store = this.injector.get(Store);

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

    store
      .select(selectIsAuthorized)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isAuthorized) => {
        if (isAuthorized) {
          socket.connect();
        } else {
          socket.disconnect();
        }
      });

    const onNotification = (payload: TPushNotificationPayload) => {
      bridge.notify(payload);
    };
    socket.on(ENotificationsEvent.NOTIFICATION, onNotification);

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
      socket.off(ENotificationsEvent.NOTIFICATION, onNotification);
      socket.disconnect();
    });
  }
}
