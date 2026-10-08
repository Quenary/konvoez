import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EUserRole,
  EVoiceRoomEvent,
  EVoiceSessionType,
  IUser,
} from '@konvoez/shared';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { AudioService } from './audio.service';
import { MediasoupSessionService } from './mediasoup-session.service';
import { ScreenWatchService } from './screen-watch.service';
import { MicrophoneService } from './microphone.service';
import { PeerPlaybackService } from './peer-playback.service';
import { PeerVideoService } from './peer-video.service';
import { ScreenWakeLockService } from './screen-wake-lock.service';
import { SpeakerService } from './speaker.service';
import { VoiceSessionService } from './voice-session.service';

const bob = {
  id: 42,
  username: 'bob',
  fullname: 'Bob',
  email: 'bob@example.com',
  avatarUrl: null,
  role: EUserRole.MEMBER,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUser;

describe('VoiceSessionService', () => {
  let service: VoiceSessionService;
  let socket: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    emitWithAck: ReturnType<typeof vi.fn>;
    timeout: ReturnType<typeof vi.fn>;
    connected: boolean;
  };
  let handlers: Record<string, (...args: unknown[]) => unknown>;
  let voiceSessionStore: {
    activeSession: ReturnType<typeof signal>;
    peersDict: ReturnType<typeof signal<Record<number, IUser>>>;
    setActiveSession: (session: unknown) => void;
    setPeers: ReturnType<typeof vi.fn>;
    upsertPeer: ReturnType<typeof vi.fn>;
    removePeer: ReturnType<typeof vi.fn>;
    clearSessionPeers: ReturnType<typeof vi.fn>;
  };
  let voiceAudioPreferencesStore: {
    microphoneMuted: ReturnType<typeof signal<boolean>>;
    speakerMuted: ReturnType<typeof signal<boolean>>;
    peerGainLevels: ReturnType<typeof signal<Record<number, number>>>;
    peerScreenGainLevels: ReturnType<typeof signal<Record<number, number>>>;
  };
  let processedStream: ReturnType<typeof signal<MediaStream | null>>;
  let microphoneService: {
    setDevice: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
    processedStream: typeof processedStream;
  };
  let mediasoup: {
    cleanup: ReturnType<typeof vi.fn>;
    clearPendingConsumes: ReturnType<typeof vi.fn>;
    ensureDeviceLoaded: ReturnType<typeof vi.fn>;
    setMicrophoneMuted: ReturnType<typeof vi.fn>;
    ensureSendTransport: ReturnType<typeof vi.fn>;
    ensureRecvTransport: ReturnType<typeof vi.fn>;
    produceMicrophone: ReturnType<typeof vi.fn>;
    replaceMicrophoneTrack: ReturnType<typeof vi.fn>;
    consume: ReturnType<typeof vi.fn>;
    consumePending: ReturnType<typeof vi.fn>;
    handleConsumerClosed: ReturnType<typeof vi.fn>;
  };
  let screenWatch: {
    release: ReturnType<typeof vi.fn>;
    onRemoteProducerClosed: ReturnType<typeof vi.fn>;
  };
  let notifications: {
    open: ReturnType<typeof vi.fn>;
  };
  let wakeLock: {
    acquire: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  let audioService: {
    playPeerJoinAudio: ReturnType<typeof vi.fn>;
    playPeerLeaveAudio: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    handlers = {};
    socket = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        handlers[event] = handler;
      }),
      off: vi.fn(),
      emitWithAck: vi.fn().mockResolvedValue(undefined),
      timeout: vi.fn(),
      connected: true,
    };
    socket.timeout.mockReturnValue(socket);

    const activeSession = signal<unknown>(null);
    voiceSessionStore = {
      activeSession: activeSession as never,
      peersDict: signal({}),
      setActiveSession: vi.fn((session: unknown) => {
        activeSession.set(session);
      }),
      setPeers: vi.fn(),
      upsertPeer: vi.fn(),
      removePeer: vi.fn(),
      clearSessionPeers: vi.fn(),
    };
    voiceAudioPreferencesStore = {
      microphoneMuted: signal(false),
      speakerMuted: signal(false),
      peerGainLevels: signal({}),
      peerScreenGainLevels: signal({}),
    };

    processedStream = signal<MediaStream | null>(null);
    microphoneService = {
      setDevice: vi.fn(),
      release: vi.fn(),
      processedStream,
    };

    mediasoup = {
      cleanup: vi.fn(),
      clearPendingConsumes: vi.fn(),
      ensureDeviceLoaded: vi.fn().mockResolvedValue(undefined),
      setMicrophoneMuted: vi.fn(),
      ensureSendTransport: vi.fn().mockResolvedValue(undefined),
      ensureRecvTransport: vi.fn().mockResolvedValue(undefined),
      produceMicrophone: vi.fn().mockResolvedValue(undefined),
      replaceMicrophoneTrack: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn().mockResolvedValue(undefined),
      consumePending: vi.fn().mockResolvedValue(undefined),
      handleConsumerClosed: vi.fn(),
    };
    screenWatch = {
      release: vi.fn(),
      onRemoteProducerClosed: vi.fn(),
    };
    notifications = {
      open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    };

    wakeLock = {
      acquire: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    audioService = {
      playPeerJoinAudio: vi.fn(),
      playPeerLeaveAudio: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        VoiceSessionService,
        { provide: VoiceRoomSocketToken, useValue: socket },
        { provide: VoiceSessionStore, useValue: voiceSessionStore },
        {
          provide: VoiceAudioPreferencesStore,
          useValue: voiceAudioPreferencesStore,
        },
        {
          provide: MicrophoneService,
          useValue: {
            ...microphoneService,
            analyserNode: signal<AnalyserNode | null>(null).asReadonly(),
          },
        },
        {
          provide: Store,
          useValue: { selectSignal: () => () => null },
        },
        { provide: SpeakerService, useValue: { setDevice: vi.fn() } },
        { provide: AudioService, useValue: audioService },
        { provide: MediasoupSessionService, useValue: mediasoup },
        { provide: ScreenWatchService, useValue: screenWatch },
        {
          provide: PeerPlaybackService,
          useValue: {
            removeConsumer: vi.fn(),
            detach: vi.fn(),
            detachAll: vi.fn(),
          },
        },
        {
          provide: PeerVideoService,
          useValue: { remove: vi.fn(), removeUser: vi.fn(), clear: vi.fn() },
        },
        { provide: ScreenWakeLockService, useValue: wakeLock },
        {
          provide: TranslateService,
          useValue: { instant: (key: string) => key },
        },
        { provide: TuiNotificationService, useValue: notifications },
      ],
    });

    service = TestBed.inject(VoiceSessionService);
  });

  it('releases the microphone when the leave ack rejects or times out', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const failures = [
      new Error('ack failed'),
      new Error('operation has timed out'),
    ];

    try {
      for (const error of failures) {
        voiceSessionStore.setActiveSession({
          type: EVoiceSessionType.GROUP_ROOM,
          roomId: 7,
        });
        socket.emitWithAck.mockImplementation((event: string) => {
          if (event === EVoiceRoomEvent.LEAVE_ROOM) {
            return new Promise(() => undefined);
          }
          return Promise.resolve(undefined);
        });
        socket.timeout.mockReturnValue({
          emitWithAck: vi.fn().mockRejectedValue(error),
        });
        microphoneService.release.mockClear();
        mediasoup.cleanup.mockClear();
        voiceSessionStore.clearSessionPeers.mockClear();

        await service.leaveSession();

        expect(socket.timeout).toHaveBeenCalledWith(3000);
        expect(microphoneService.release).toHaveBeenCalledTimes(1);
        expect(mediasoup.cleanup).toHaveBeenCalled();
        expect(voiceSessionStore.clearSessionPeers).toHaveBeenCalled();
      }
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('seeds microphone mute from the store before opening the send transport', async () => {
    voiceAudioPreferencesStore.microphoneMuted.set(true);

    await service.joinSession({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });

    expect(mediasoup.setMicrophoneMuted).toHaveBeenCalledWith(true);
    expect(mediasoup.ensureSendTransport).toHaveBeenCalledWith();
    expect(
      mediasoup.setMicrophoneMuted.mock.invocationCallOrder[0],
    ).toBeLessThan(mediasoup.ensureSendTransport.mock.invocationCallOrder[0]);
  });

  it('releases the microphone when leaving a session', async () => {
    voiceSessionStore.setActiveSession({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 42,
    });
    await service.leaveSession();

    expect(microphoneService.release).toHaveBeenCalledTimes(1);
    expect(socket.emitWithAck).toHaveBeenCalledWith('leave-room');
    expect(mediasoup.clearPendingConsumes).toHaveBeenCalled();
    expect(wakeLock.release).toHaveBeenCalled();
  });

  it('drains pending consumes after PEER_JOINED', async () => {
    voiceSessionStore.setActiveSession({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });
    service['addSocketListeners']();

    await handlers['peer-joined']({
      user: bob,
      roomId: 1,
      sessionKey: 'room:1',
    });

    expect(voiceSessionStore.upsertPeer).toHaveBeenCalledWith(bob);
    expect(mediasoup.consumePending).toHaveBeenCalled();
  });

  it('removes a peer when PEER_LEFT arrives', () => {
    voiceSessionStore.setActiveSession({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });
    service['addSocketListeners']();

    handlers['peer-left']({
      user: { id: bob.id },
      roomId: 1,
      sessionKey: 'room:1',
    });

    expect(voiceSessionStore.removePeer).toHaveBeenCalledWith(bob.id);
    expect(screenWatch.release).toHaveBeenCalledWith(bob.id);
  });

  it('replaces the published track when the selected device disappears', async () => {
    const track = { enabled: true } as MediaStreamTrack;
    microphoneService.setDevice.mockImplementation(async () => {
      processedStream.set({
        getAudioTracks: () => [track],
      } as MediaStream);
    });
    voiceSessionStore.setActiveSession({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });

    await service.setAudioInput(null);
    TestBed.flushEffects();

    expect(microphoneService.setDevice).toHaveBeenCalledWith(null);
    expect(mediasoup.replaceMicrophoneTrack).toHaveBeenCalledWith(track);
  });

  it('ignores a duplicate join to the same active session', async () => {
    const target: {
      type: EVoiceSessionType.GROUP_ROOM;
      roomId: number;
    } = {
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 3,
    };
    voiceSessionStore.setActiveSession(target);
    socket.emitWithAck.mockClear();
    audioService.playPeerJoinAudio.mockClear();

    await service.joinSession(target);

    expect(socket.emitWithAck).not.toHaveBeenCalledWith(
      EVoiceRoomEvent.JOIN_ROOM,
      expect.anything(),
    );
    expect(audioService.playPeerJoinAudio).not.toHaveBeenCalled();
  });

  it('emits JOIN_ROOM once for two consecutive joins to the same room', async () => {
    const target: {
      type: EVoiceSessionType.GROUP_ROOM;
      roomId: number;
    } = {
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 5,
    };
    let joinAcks = 0;
    socket.emitWithAck.mockImplementation((event: string) => {
      if (event === EVoiceRoomEvent.JOIN_ROOM) {
        joinAcks += 1;
        return new Promise((resolve) => {
          setTimeout(() => {
            voiceSessionStore.setActiveSession(target);
            resolve(undefined);
          }, 50);
        });
      }
      return Promise.resolve(undefined);
    });
    audioService.playPeerJoinAudio.mockClear();

    const first = service.joinSession(target);
    await vi.waitFor(() => {
      expect(service.joiningTarget()).toEqual(target);
    });
    const second = service.joinSession(target);
    await Promise.all([first, second]);

    expect(joinAcks).toBe(1);
    expect(audioService.playPeerJoinAudio).toHaveBeenCalledTimes(1);
    const leaveCalls = socket.emitWithAck.mock.calls.filter(
      ([event]) => event === EVoiceRoomEvent.LEAVE_ROOM,
    );
    expect(leaveCalls).toHaveLength(0);
  });

  it('notifies when rejoining on connect fails', async () => {
    voiceSessionStore.setActiveSession({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });
    socket.emitWithAck.mockImplementation((event: string) => {
      if (event === EVoiceRoomEvent.JOIN_ROOM) {
        return Promise.reject(new Error('join failed'));
      }
      return Promise.resolve(undefined);
    });

    handlers['connect']();
    await vi.waitFor(() => {
      expect(notifications.open).toHaveBeenCalledWith(
        'VOICE.JOIN_FAILED',
        expect.objectContaining({ appearance: 'negative' }),
      );
    });
  });
});
