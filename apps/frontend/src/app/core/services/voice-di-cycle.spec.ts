import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_DEVICE_HANDLER } from '../tokens/audio-device-handler.token';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { EntitySyncSocketToken } from '../tokens/entity-sync-socket.token';
import { NotificationsSocketToken } from '../tokens/notifications-socket.token';
import { VoiceSessionService } from './voice-session.service';
import { CameraService } from './camera.service';
import { ScreenCaptureService } from './screen-capture.service';
import { MediasoupSessionService } from './mediasoup-session.service';
import { LocalScreenPreviewService } from './local-screen-preview.service';
import { ConsumerRegistry } from './consumer-registry';
import { ScreenWatchService } from './screen-watch.service';
import { VoiceSessionPeersService } from '@shared/components/voice-room/voice-session-peers.service';
import { VoiceRoomViewService } from '@shared/components/voice-room/voice-room-view.service';
import { VoiceRoomTilesService } from '@shared/components/voice-room/voice-room-tiles.service';
import { VoiceRoomActionsService } from '@shared/components/voice-room/voice-room-actions.service';
import { VoiceLeaveService } from './voice-leave.service';
import { DirectCallService } from './direct-call.service';
import { AudioService } from './audio.service';
import { MicrophoneService } from './microphone.service';
import { SpeakerService } from './speaker.service';
import { PeerPlaybackService } from './peer-playback.service';
import { PeerScreenAudioService } from './peer-screen-audio.service';
import { EntitySyncService } from './entity-sync.service';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { SettingsStore } from '@core/stores/settings.store';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { authReducer } from '@core/auth/auth.reducer';
import { RoomsStore } from '@core/stores/rooms.store';
import { UsersStore } from '@core/stores/users.store';
import { RoomNavigationService } from '@features/rooms/room-navigation.service';
import { DesktopBridgeService } from '@core/desktop/desktop-bridge.service';

/**
 * Guards against NG0200 circular DI:
 * SettingsStore → AUDIO_DEVICE_HANDLER → VoiceSessionService → Mediasoup →
 * Camera/ScreenCapture → SettingsStore (must be lazy via Injector).
 * Also covers voice stores, DirectCallService, VoiceLeaveService, and
 * VoiceRoomViewService used by the shared voice-room UI.
 */
describe('voice DI graph', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter([]),
        provideStore({
          auth: authReducer,
        }),
        SettingsStore,
        EntitySyncService,
        RoomsStore,
        UsersStore,
        VoiceSessionService,
        MediasoupSessionService,
        CameraService,
        ScreenCaptureService,
        LocalScreenPreviewService,
        VoiceSessionPeersService,
        VoiceRoomViewService,
        VoiceRoomTilesService,
        VoiceRoomActionsService,
        VoiceLeaveService,
        DirectCallService,
        VoiceSessionStore,
        VoiceLobbyStore,
        VoiceAudioPreferencesStore,
        DesktopBridgeService,
        ConsumerRegistry,
        ScreenWatchService,
        MicrophoneService,
        SpeakerService,
        PeerPlaybackService,
        PeerScreenAudioService,
        {
          provide: AudioService,
          useValue: {
            startOutgoingDialing: vi.fn(),
            stopOutgoingDialing: vi.fn(),
            startIncomingRingtone: vi.fn(),
            stopIncomingRingtone: vi.fn(),
            playCallEndSound: vi.fn(),
            playMuteAudio: vi.fn(),
            playPeerJoinAudio: vi.fn(),
            playPeerLeaveAudio: vi.fn(),
            playStreamStartAudio: vi.fn(),
            playStreamStopAudio: vi.fn(),
          },
        },
        {
          provide: AUDIO_DEVICE_HANDLER,
          useExisting: VoiceSessionService,
        },
        {
          provide: VoiceRoomSocketToken,
          useValue: {
            connected: false,
            on: vi.fn(),
            off: vi.fn(),
            emit: vi.fn(),
            emitWithAck: vi.fn(),
            timeout: vi.fn().mockReturnValue({ emitWithAck: vi.fn() }),
          },
        },
        {
          provide: EntitySyncSocketToken,
          useValue: {
            connected: false,
            on: vi.fn(),
            off: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
          },
        },
        {
          provide: NotificationsSocketToken,
          useValue: {
            connected: false,
            on: vi.fn(),
            off: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
          },
        },
        {
          provide: TranslateService,
          useValue: { instant: (k: string) => k },
        },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn(() => ({ subscribe: vi.fn() })) },
        },
      ],
    });
  });

  const injectVoiceGraph = (
    first: 'settings' | 'entitySync' | 'voiceSession',
  ) => {
    const injectors: Record<string, () => void> = {
      settings: () => TestBed.inject(SettingsStore),
      entitySync: () => TestBed.inject(EntitySyncService),
      voiceSession: () => TestBed.inject(VoiceSessionService),
    };
    injectors[first]();
    if (first !== 'settings') {
      injectors['settings']();
    }
    if (first !== 'entitySync') {
      injectors['entitySync']();
    }
    if (first !== 'voiceSession') {
      injectors['voiceSession']();
    }
  };

  it.each(['settings', 'entitySync', 'voiceSession'] as const)(
    'constructs the voice/settings graph when %s is injected first',
    (first) => {
      let error: unknown;
      try {
        injectVoiceGraph(first);
        TestBed.inject(CameraService);
        TestBed.inject(ScreenCaptureService);
        TestBed.inject(MediasoupSessionService);
        TestBed.inject(LocalScreenPreviewService);
        TestBed.inject(VoiceSessionPeersService);
        TestBed.inject(VoiceRoomTilesService);
        TestBed.inject(VoiceRoomActionsService);
        TestBed.inject(MicrophoneService);
        TestBed.inject(SpeakerService);
        TestBed.inject(PeerPlaybackService);
        TestBed.inject(PeerScreenAudioService);
        TestBed.inject(VoiceSessionStore);
        TestBed.inject(RoomsStore);
        TestBed.inject(VoiceLobbyStore);
        TestBed.inject(VoiceAudioPreferencesStore);
        TestBed.inject(DirectCallService);
        TestBed.inject(VoiceLeaveService);
        TestBed.inject(VoiceRoomViewService);
        TestBed.inject(ConsumerRegistry);
        TestBed.inject(ScreenWatchService);
        TestBed.inject(RoomNavigationService);
        TestBed.inject(DesktopBridgeService);
      } catch (e) {
        error = e;
      }
      if (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toMatch(/NG0200|Circular dependency/i);
        throw error;
      }
      expect(TestBed.inject(CameraService)).toBeTruthy();
      expect(TestBed.inject(ScreenCaptureService)).toBeTruthy();
      expect(TestBed.inject(LocalScreenPreviewService)).toBeTruthy();
      expect(TestBed.inject(VoiceSessionPeersService)).toBeTruthy();
      expect(TestBed.inject(VoiceRoomTilesService)).toBeTruthy();
      expect(TestBed.inject(VoiceRoomActionsService)).toBeTruthy();
      expect(TestBed.inject(MicrophoneService)).toBeTruthy();
      expect(TestBed.inject(SpeakerService)).toBeTruthy();
      expect(TestBed.inject(PeerPlaybackService)).toBeTruthy();
      expect(TestBed.inject(PeerScreenAudioService)).toBeTruthy();
      expect(TestBed.inject(VoiceSessionStore)).toBeTruthy();
      expect(TestBed.inject(VoiceLobbyStore)).toBeTruthy();
      expect(TestBed.inject(VoiceAudioPreferencesStore)).toBeTruthy();
      expect(TestBed.inject(DirectCallService)).toBeTruthy();
      expect(TestBed.inject(VoiceLeaveService)).toBeTruthy();
      expect(TestBed.inject(VoiceRoomViewService)).toBeTruthy();
      expect(TestBed.inject(ConsumerRegistry)).toBeTruthy();
      expect(TestBed.inject(ScreenWatchService)).toBeTruthy();
      expect(TestBed.inject(RoomNavigationService)).toBeTruthy();
      expect(TestBed.inject(DesktopBridgeService)).toBeTruthy();
    },
  );

  it('initializes DesktopBridgeService with window.konvoezDesktop without NG0200', () => {
    const fakeBridge = {
      apiVersion: 1,
      platform: 'linux',
      appVersion: '0.1.0',
      notify: vi.fn(),
      setVoiceState: vi.fn(),
      onCommand: vi.fn(() => () => undefined),
      quitReady: vi.fn(),
    };
    (window as unknown as { konvoezDesktop?: unknown }).konvoezDesktop =
      fakeBridge;
    try {
      const bridgeService = TestBed.inject(DesktopBridgeService);
      expect(() => bridgeService.init()).not.toThrow();
      TestBed.flushEffects();
      expect(fakeBridge.setVoiceState).toHaveBeenCalled();
    } finally {
      delete (window as unknown as { konvoezDesktop?: unknown }).konvoezDesktop;
    }
  });
});
