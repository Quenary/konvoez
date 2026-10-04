import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideStore, Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { EVoiceSessionType } from '@konvoez/shared';
import { AudioService } from '@core/services/audio.service';
import { DirectCallService } from '@core/services/direct-call.service';
import { MediasoupSessionService } from '@core/services/mediasoup-session.service';
import { MicrophoneService } from '@core/services/microphone.service';
import { PeerPlaybackService } from '@core/services/peer-playback.service';
import { PushNotificationService } from '@core/services/push-notification.service';
import { ScreenWakeLockService } from '@core/services/screen-wake-lock.service';
import { SpeakerService } from '@core/services/speaker.service';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { VoiceRoomSocketToken } from '@core/tokens/voice-room-socket.token';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { OutgoingMessagesStore } from '@features/text-room/outgoing/outgoing-messages.store';
import { UsersStore } from '@features/users/users.store';
import { AuthApiService } from './auth-api.service';
import { AuthEffects } from './auth.effects';
import { authReducer } from './auth.reducer';
import { AuthActions } from './auth.actions';
import { ProfileApiService } from '../settings/settings-profile/profile-api.service';

describe('AuthEffects logout', () => {
  let store: Store;
  let router: { navigate: ReturnType<typeof vi.fn> };
  let microphoneService: {
    release: ReturnType<typeof vi.fn>;
    processedStream: ReturnType<typeof signal<MediaStream | null>>;
  };
  let socket: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    emitWithAck: ReturnType<typeof vi.fn>;
    timeout: ReturnType<typeof vi.fn>;
    connected: boolean;
  };
  let setActiveSession: (session: unknown) => void;

  beforeEach(() => {
    const hanging = () => new Promise(() => undefined);
    socket = {
      on: vi.fn(),
      off: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      emitWithAck: vi.fn(hanging),
      timeout: vi.fn(),
      connected: false,
    };
    socket.timeout.mockReturnValue({
      emitWithAck: vi.fn(hanging),
    });

    const activeSession = signal<unknown>(null);
    setActiveSession = (session: unknown) => {
      activeSession.set(session);
    };

    router = {
      navigate: vi.fn().mockResolvedValue(true),
    };
    microphoneService = {
      release: vi.fn().mockResolvedValue(undefined),
      processedStream: signal<MediaStream | null>(null),
    };

    TestBed.configureTestingModule({
      providers: [
        provideStore({ auth: authReducer }),
        provideEffects(AuthEffects),
        VoiceLeaveService,
        VoiceSessionService,
        { provide: VoiceRoomSocketToken, useValue: socket },
        { provide: Router, useValue: router },
        { provide: AuthApiService, useValue: { logout: () => of(undefined) } },
        { provide: ProfileApiService, useValue: {} },
        { provide: UsersStore, useValue: { clear: vi.fn() } },
        {
          provide: OutgoingMessagesStore,
          useValue: { cancelAll: vi.fn() },
        },
        {
          provide: TranslateService,
          useValue: { instant: (key: string) => key },
        },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn().mockReturnValue(of(null)) },
        },
        {
          provide: PushNotificationService,
          useValue: { syncExistingSubscription: () => of(undefined) },
        },
        {
          provide: DirectCallService,
          useValue: {
            isCallActive: () => false,
            leaveCall: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: VoiceRoomStore,
          useValue: {
            activeSession,
            setActiveSession,
            clearSessionPeers: vi.fn(),
            setRoomsState: vi.fn(),
          },
        },
        { provide: MicrophoneService, useValue: microphoneService },
        { provide: SpeakerService, useValue: {} },
        {
          provide: AudioService,
          useValue: {
            playPeerJoinAudio: vi.fn(),
            playPeerLeaveAudio: vi.fn(),
          },
        },
        {
          provide: MediasoupSessionService,
          useValue: {
            cleanup: vi.fn(),
            clearPendingConsumes: vi.fn(),
            replaceMicrophoneTrack: vi.fn(),
          },
        },
        { provide: PeerPlaybackService, useValue: {} },
        {
          provide: ScreenWakeLockService,
          useValue: { acquire: vi.fn(), release: vi.fn() },
        },
      ],
    });

    store = TestBed.inject(Store);
  });

  it('navigates to /auth and releases the mic when logout leaves a disconnected session', async () => {
    setActiveSession({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });

    store.dispatch(AuthActions.requestLogout());

    await vi.waitFor(() => {
      expect(router.navigate).toHaveBeenCalledWith(['/auth']);
    });
    expect(microphoneService.release).toHaveBeenCalled();
    expect(socket.emitWithAck).not.toHaveBeenCalled();
  });
});
