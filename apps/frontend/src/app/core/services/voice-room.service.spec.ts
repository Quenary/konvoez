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
import { DirectCallService } from './direct-call.service';
import { AudioActivityService } from './audio-activity.service';
import { AudioService } from './audio.service';
import { EVoiceSessionType } from '@konvoez/shared';

describe('VoiceRoomService', () => {
  let service: VoiceRoomService;
  let socket: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    emitWithAck: ReturnType<typeof vi.fn>;
    connected: boolean;
  };
  let directCallService: {
    isConnected: ReturnType<typeof vi.fn>;
    isCallActive: ReturnType<typeof vi.fn>;
    leaveCall: ReturnType<typeof vi.fn>;
    detachFromCallWithoutHangup: ReturnType<typeof vi.fn>;
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

    directCallService = {
      isConnected: vi.fn().mockReturnValue(false),
      isCallActive: vi.fn().mockReturnValue(false),
      leaveCall: vi.fn().mockResolvedValue(undefined),
      detachFromCallWithoutHangup: vi.fn(),
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
          provide: AudioActivityService,
          useValue: {
            isSpeaking: vi.fn().mockReturnValue(() => false),
            register: vi.fn(),
            unregister: vi.fn(),
          },
        },
        {
          provide: AudioService,
          useValue: {
            playPeerJoinAudio: vi.fn(),
            playPeerLeaveAudio: vi.fn(),
          },
        },
        {
          provide: DirectCallService,
          useValue: directCallService,
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

  it('should release the microphone when leaving a session', async () => {
    const microphoneService = TestBed.inject(MicrophoneService) as any;

    service['_activeSession'].set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 42,
    });
    await service.leaveSession();

    expect(microphoneService.release).toHaveBeenCalledTimes(1);
    expect(socket.emitWithAck).toHaveBeenCalledWith('leave-room');
  });

  it('should clear pending consumes when leaving a session', async () => {
    service['_activeSession'].set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });
    service['pendingConsumes'] = [
      {
        producerId: 'p1',
        userId: 1,
        kind: 'audio',
        mediaTag: 'mic',
      },
    ];
    service['consuming'].add('p1');

    await service.leaveSession();

    expect(service['pendingConsumes']).toEqual([]);
    expect(service['consuming'].size).toBe(0);
  });

  it('leaveCurrent leaves a direct call when one is active', async () => {
    directCallService.isCallActive.mockReturnValue(true);

    await service.leaveCurrent();

    expect(directCallService.leaveCall).toHaveBeenCalledTimes(1);
    expect(socket.emitWithAck).not.toHaveBeenCalled();
  });

  it('leaveCurrent leaves the media session when no call is active', async () => {
    service['_activeSession'].set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 7,
    });

    await service.leaveCurrent();

    expect(directCallService.leaveCall).not.toHaveBeenCalled();
    expect(socket.emitWithAck).toHaveBeenCalledWith('leave-room');
    expect(service.activeSession()).toBeNull();
  });
});
