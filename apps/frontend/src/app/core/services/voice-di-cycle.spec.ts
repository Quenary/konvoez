import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideStore } from '@ngrx/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_DEVICE_HANDLER } from '../tokens/audio-device-handler.token';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { VoiceSessionService } from './voice-session.service';
import { CameraService } from './camera.service';
import { ScreenCaptureService } from './screen-capture.service';
import { MediasoupSessionService } from './mediasoup-session.service';
import { SettingsStore } from '@features/settings/settings.store';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { authReducer } from '@features/auth/auth.reducer';
import { roomsReducer } from '@features/rooms/rooms.reducer';

/**
 * Guards against NG0200 circular DI:
 * SettingsStore → AUDIO_DEVICE_HANDLER → VoiceSessionService → Mediasoup →
 * Camera/ScreenCapture → SettingsStore (must be lazy via Injector).
 */
describe('voice DI graph', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideStore({
          auth: authReducer,
          rooms: roomsReducer,
        }),
        VoiceSessionService,
        MediasoupSessionService,
        CameraService,
        ScreenCaptureService,
        SettingsStore,
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
  });
});
