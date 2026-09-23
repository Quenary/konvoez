import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  (globalThis as any).AudioWorkletNode = class AudioWorkletNode {};
});

import { storageJson } from '../../../extentions/local-storage-json';
import { VoiceRoomService } from './voice-room.service';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { SettingsStore } from '@features/settings/settings.store';
import { AUDIO_DEVICE_HANDLER } from '../tokens/audio-device-handler.token';
import { MicrophoneService } from './microphone.service';
import { SpeakerService } from './speaker.service';

describe('VoiceRoomService', () => {
  let service: VoiceRoomService;
  let socket: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    emitWithAck: ReturnType<typeof vi.fn>;
    connected: boolean;
  };

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(localStorage, 'getItemJson', {
      value: function (key: string) {
        const value = this.getItem(key);
        if (!value) return null;
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      },
      configurable: true,
    });
    Object.defineProperty(localStorage, 'setItemJson', {
      value: function (key: string, value: unknown) {
        this.setItem(key, JSON.stringify(value));
      },
      configurable: true,
    });
    storageJson();

    socket = {
      on: vi.fn(),
      off: vi.fn(),
      emitWithAck: vi.fn().mockResolvedValue(undefined),
      connected: true,
    };

    TestBed.configureTestingModule({
      providers: [
        VoiceRoomService,
        {
          provide: VoiceRoomSocketToken,
          useValue: socket,
        },
        {
          provide: MicrophoneService,
          useValue: {
            getStream: vi.fn(),
            setDevice: vi.fn(),
            release: vi.fn(),
          },
        },
        {
          provide: SpeakerService,
          useValue: {
            getContext: vi.fn(),
            setDevice: vi.fn(),
            release: vi.fn(),
          },
        },
        {
          provide: AUDIO_DEVICE_HANDLER,
          useValue: {
            setAudioInput: vi.fn(),
            setAudioOutput: vi.fn(),
          },
        },
        {
          provide: SettingsStore,
          useValue: {
            iceServers: vi.fn().mockReturnValue([]),
          },
        },
      ],
    });

    service = TestBed.inject(VoiceRoomService);
  });

  it('should release the microphone when leaving a room', async () => {
    const microphoneService = TestBed.inject(MicrophoneService) as any;

    service['_selectedRoomId'].set(42);
    await service.leaveRoom();

    expect(microphoneService.release).toHaveBeenCalledTimes(1);
    expect(socket.emitWithAck).toHaveBeenCalledWith('leave-room');
  });
});
