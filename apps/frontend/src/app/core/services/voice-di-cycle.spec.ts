import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_DEVICE_HANDLER } from '../tokens/audio-device-handler.token';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { VoiceSessionService } from './voice-session.service';
import { CameraService } from './camera.service';
import { ScreenCaptureService } from './screen-capture.service';
import { MediasoupSessionService } from './mediasoup-session.service';
import { LocalScreenPreviewService } from './local-screen-preview.service';
import { ConsumerRegistry } from './consumer-registry';
import { ScreenWatchService } from './screen-watch.service';
import { VoiceSessionPeersService } from '@shared/components/voice-room/voice-session-peers.service';
import { VoiceRoomViewService } from '@shared/components/voice-room/voice-room-view.service';
import { VoiceLeaveService } from './voice-leave.service';
import { DirectCallService } from './direct-call.service';
import { AudioService } from './audio.service';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { SettingsStore } from '@features/settings/settings.store';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { authReducer } from '@features/auth/auth.reducer';
import { RoomsStore } from '@features/rooms/rooms.store';

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
        RoomsStore,
        VoiceSessionService,
        MediasoupSessionService,
        CameraService,
        ScreenCaptureService,
        LocalScreenPreviewService,
        VoiceSessionPeersService,
        VoiceRoomViewService,
        VoiceLeaveService,
        DirectCallService,
        VoiceSessionStore,
        VoiceLobbyStore,
        VoiceAudioPreferencesStore,
        ConsumerRegistry,
        ScreenWatchService,
        SettingsStore,
        {
          provide: AudioService,
          useValue: {
            startOutgoingDialing: vi.fn(),
            stopOutgoingDialing: vi.fn(),
            startIncomingRingtone: vi.fn(),
            stopIncomingRingtone: vi.fn(),
            playCallEndSound: vi.fn(),
            playMuteAudio: vi.fn(),
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
            emitWithAck: vi.fn(),
            timeout: vi.fn().mockReturnValue({ emitWithAck: vi.fn() }),
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

  it('constructs the voice/settings graph without NG0200 circular dependency', () => {
    let error: unknown;
    try {
      TestBed.inject(VoiceSessionService);
      TestBed.inject(CameraService);
      TestBed.inject(ScreenCaptureService);
      TestBed.inject(MediasoupSessionService);
      TestBed.inject(SettingsStore);
      TestBed.inject(LocalScreenPreviewService);
      TestBed.inject(VoiceSessionPeersService);
      TestBed.inject(VoiceSessionStore);
      TestBed.inject(RoomsStore);
      TestBed.inject(VoiceLobbyStore);
      TestBed.inject(VoiceAudioPreferencesStore);
      TestBed.inject(DirectCallService);
      TestBed.inject(VoiceLeaveService);
      TestBed.inject(VoiceRoomViewService);
      TestBed.inject(ConsumerRegistry);
      TestBed.inject(ScreenWatchService);
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
    expect(TestBed.inject(VoiceSessionStore)).toBeTruthy();
    expect(TestBed.inject(VoiceLobbyStore)).toBeTruthy();
    expect(TestBed.inject(VoiceAudioPreferencesStore)).toBeTruthy();
    expect(TestBed.inject(DirectCallService)).toBeTruthy();
    expect(TestBed.inject(VoiceLeaveService)).toBeTruthy();
    expect(TestBed.inject(VoiceRoomViewService)).toBeTruthy();
    expect(TestBed.inject(ConsumerRegistry)).toBeTruthy();
    expect(TestBed.inject(ScreenWatchService)).toBeTruthy();
  });
});
