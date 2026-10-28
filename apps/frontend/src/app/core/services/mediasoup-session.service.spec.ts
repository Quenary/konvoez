import {
  EVoiceQualityTier,
  EVoiceRoomEvent,
  VOICE_STALL_MS,
  VOICE_WATCHDOG_INTERVAL_MS,
} from '@konvoez/shared';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { VoiceConnectionStore } from '@core/voice/voice-connection.store';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { MicrophoneService } from './microphone.service';
import { PeerPlaybackService } from './peer-playback.service';
import { PeerVideoService } from './peer-video.service';
import { CameraService } from './camera.service';
import { ScreenCaptureService } from './screen-capture.service';
import { PeerScreenAudioService } from './peer-screen-audio.service';
import { SettingsStore } from '@core/stores/settings.store';
import { MediasoupSessionService } from './mediasoup-session.service';
import { AudioService } from './audio.service';
import { MediaDeviceSwitchNotifierService } from './media-device-switch-notifier.service';
import { VoiceQualityService } from './voice-quality.service';

describe('MediasoupSessionService', () => {
  let service: MediasoupSessionService;
  let getStream: ReturnType<typeof vi.fn>;
  let releaseCamera: ReturnType<typeof vi.fn>;
  let setLocalCamTrack: ReturnType<typeof vi.fn>;
  let deviceChanged$: Subject<void>;
  let notify: ReturnType<typeof vi.fn>;
  let emitWithAck: ReturnType<typeof vi.fn>;
  let socketTimeout: ReturnType<typeof vi.fn>;
  let releaseScreen: ReturnType<typeof vi.fn>;
  let socketOn: ReturnType<typeof vi.fn>;
  let socketOff: ReturnType<typeof vi.fn>;
  let voiceQualityService: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };
  let audioService: {
    playStreamStartAudio: ReturnType<typeof vi.fn>;
    playStreamStopAudio: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    getStream = vi.fn();
    releaseCamera = vi.fn();
    setLocalCamTrack = vi.fn();
    deviceChanged$ = new Subject<void>();
    notify = vi.fn();
    emitWithAck = vi.fn().mockResolvedValue({});
    socketTimeout = vi.fn().mockReturnValue({ emitWithAck });
    releaseScreen = vi.fn();
    socketOn = vi.fn();
    socketOff = vi.fn();
    voiceQualityService = {
      start: vi.fn(),
      stop: vi.fn(),
    };
    audioService = {
      playStreamStartAudio: vi.fn(),
      playStreamStopAudio: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        MediasoupSessionService,
        {
          provide: MediaDeviceSwitchNotifierService,
          useValue: { notify },
        },
        {
          provide: AudioService,
          useValue: audioService,
        },
        {
          provide: VoiceQualityService,
          useValue: voiceQualityService,
        },
        {
          provide: VoiceRoomSocketToken,
          useValue: {
            emitWithAck,
            timeout: socketTimeout,
            on: socketOn,
            off: socketOff,
          },
        },
        {
          provide: MicrophoneService,
          useValue: {
            getStream,
          },
        },
        {
          provide: PeerPlaybackService,
          useValue: {
            attach: vi.fn(),
          },
        },
        {
          provide: PeerVideoService,
          useValue: {
            attach: vi.fn(),
            clear: vi.fn(),
            setLocalCamTrack,
            setLocalScreenTrack: vi.fn(),
            registerAvailableScreen: vi.fn(),
            unregisterAvailableScreenProducer: vi.fn(),
            availableScreens: vi.fn(() => ({})),
            stopWatchingLocal: vi.fn(),
            getScreenConsumerId: vi.fn(),
          },
        },
        {
          provide: CameraService,
          useValue: {
            getTrack: vi.fn(),
            release: releaseCamera,
            deviceChanged$: deviceChanged$.asObservable(),
          },
        },
        {
          provide: ScreenCaptureService,
          useValue: {
            getTracks: vi.fn(),
            release: releaseScreen,
          },
        },
        {
          provide: PeerScreenAudioService,
          useValue: {
            attach: vi.fn(),
            detach: vi.fn(),
            clear: vi.fn(),
            getConsumerId: vi.fn(),
          },
        },
        {
          provide: SettingsStore,
          useValue: {
            iceServers: vi.fn().mockReturnValue([]),
            voiceMaxBitrateKbps: vi.fn().mockReturnValue(64),
            streamMaxBitrateKbps: vi.fn().mockReturnValue(10000),
            streamHeight: vi.fn().mockReturnValue(720),
            streamFps: vi.fn().mockReturnValue(30),
            streamLayers: vi.fn().mockReturnValue(2),
            streamBitrateKbps: vi.fn().mockReturnValue(2500),
            screenHeight: vi.fn().mockReturnValue(1080),
            screenFps: vi.fn().mockReturnValue(30),
            screenLayers: vi.fn().mockReturnValue(3),
            screenBitrateKbps: vi.fn().mockReturnValue(5000),
            screenContentMode: vi.fn().mockReturnValue('detail'),
          },
        },
        {
          provide: TranslateService,
          useValue: {
            instant: vi.fn((key: string) => key),
          },
        },
        {
          provide: TuiNotificationService,
          useValue: {
            open: vi.fn().mockReturnValue(of({})),
          },
        },
      ],
    });
    service = TestBed.inject(MediasoupSessionService);
  });

  it('ignores camera device changes without an active camera producer', async () => {
    const getTrack = TestBed.inject(CameraService).getTrack as ReturnType<
      typeof vi.fn
    >;
    deviceChanged$.next();
    await service.switchCamera();

    expect(getTrack).not.toHaveBeenCalled();
    expect(releaseCamera).not.toHaveBeenCalled();
  });

  it('replaces the camera producer track when the camera device changes', async () => {
    const replaceTrack = vi.fn().mockResolvedValue(undefined);
    service['cameraProducer'] = {
      id: 'cam-prod',
      closed: false,
      replaceTrack,
      close: vi.fn(),
      track: { getSettings: () => ({ deviceId: 'cam-1' }) },
    } as never;
    const track = {
      id: 'cam-2',
      label: 'USB cam',
      getSettings: () => ({ deviceId: 'cam-2' }),
    } as unknown as MediaStreamTrack;
    TestBed.inject(CameraService).getTrack = vi.fn().mockResolvedValue(track);

    deviceChanged$.next();

    await vi.waitFor(() => {
      expect(replaceTrack).toHaveBeenCalledWith({ track });
    });
    expect(setLocalCamTrack).toHaveBeenCalledWith(track);
    expect(releaseCamera).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('videoinput', 'USB cam');
  });

  it('stops the camera when no camera can be opened after a device change', async () => {
    service['cameraProducer'] = {
      id: 'cam-prod',
      closed: false,
      replaceTrack: vi.fn(),
      close: vi.fn(),
    } as never;
    TestBed.inject(CameraService).getTrack = vi
      .fn()
      .mockRejectedValue(new Error('NotFoundError'));

    deviceChanged$.next();

    await vi.waitFor(() => {
      expect(releaseCamera).toHaveBeenCalledTimes(1);
    });
    expect(setLocalCamTrack).toHaveBeenCalledWith(null);
    expect(service['cameraProducer']).toBeNull();
  });

  it('clears pending consumes', () => {
    service['pendingConsumes'] = [
      {
        producerId: 'p1',
        userId: 1,
        kind: 'audio',
        mediaTag: 'mic',
      },
    ];
    service['consuming'].add('p1');

    service.clearPendingConsumes();

    expect(service['pendingConsumes']).toEqual([]);
    expect(service['consuming'].size).toBe(0);
  });

  it('replaces an existing microphone producer', async () => {
    const close = vi.fn();
    const produce = vi.fn().mockResolvedValue({
      track: { enabled: true },
      on: vi.fn(),
    });
    service['sendTransport'] = { produce, closed: false } as never;
    service['microphoneProducer'] = {
      close,
      track: { enabled: true },
    } as never;
    getStream.mockResolvedValue({
      getAudioTracks: () => [
        { enabled: true, muted: false, readyState: 'live' },
      ],
    });

    await service.produceMicrophone();

    expect(close).toHaveBeenCalledTimes(1);
    expect(produce).toHaveBeenCalledTimes(1);
    expect(produce).toHaveBeenCalledWith(
      expect.objectContaining({ stopTracks: false }),
    );
  });

  it('waits for a muted capture track to unmute before producing', async () => {
    const listeners: Record<string, () => void> = {};
    const track = {
      enabled: true,
      muted: true,
      readyState: 'live',
      addEventListener: (event: string, handler: () => void) => {
        listeners[event] = handler;
      },
      removeEventListener: vi.fn(),
    };
    const produce = vi.fn().mockResolvedValue({
      track,
      on: vi.fn(),
    });
    service['sendTransport'] = { produce, closed: false } as never;
    getStream.mockResolvedValue({
      getAudioTracks: () => [track],
    });

    const pending = service.produceMicrophone();
    await vi.waitFor(() => {
      expect(listeners['unmute']).toBeTypeOf('function');
    });
    expect(produce).not.toHaveBeenCalled();

    track.muted = false;
    const unmute = listeners['unmute'];
    expect(unmute).toBeTypeOf('function');
    unmute?.();
    await pending;

    expect(produce).toHaveBeenCalledTimes(1);
  });

  it('reproduces when the producer track ends unexpectedly', async () => {
    const trackEndedHandlers: Array<() => void> = [];
    const producers: Array<{
      close: ReturnType<typeof vi.fn>;
      closed: boolean;
    }> = [];
    const produce = vi.fn().mockImplementation(async () => {
      const producer = {
        track: { enabled: true },
        closed: false,
        close: vi.fn(),
        on: (event: string, handler: () => void) => {
          if (event === 'trackended') {
            trackEndedHandlers.push(handler);
          }
        },
      };
      producer.close.mockImplementation(() => {
        producer.closed = true;
      });
      producers.push(producer);
      return producer;
    });
    service['sendTransport'] = { produce, closed: false } as never;
    getStream.mockResolvedValue({
      getAudioTracks: () => [
        { enabled: true, muted: false, readyState: 'live' },
      ],
    });

    await service.produceMicrophone();
    expect(produce).toHaveBeenCalledTimes(1);
    expect(trackEndedHandlers).toHaveLength(1);

    const endedHandler = trackEndedHandlers.at(0);
    expect(endedHandler).toBeTypeOf('function');
    endedHandler?.();
    expect(producers[0]?.close).toHaveBeenCalledTimes(1);
    expect(producers[0]?.closed).toBe(true);
    await vi.waitFor(() => {
      expect(produce).toHaveBeenCalledTimes(2);
    });
    expect(producers[1]?.closed).toBe(false);
  });

  it('keeps a mute set before produce starts', async () => {
    const track = {
      enabled: true,
      muted: false,
      readyState: 'live',
    } as MediaStreamTrack;
    const produce = vi.fn().mockResolvedValue({
      track,
      on: vi.fn(),
      closed: false,
    });
    service['sendTransport'] = { produce, closed: false } as never;
    getStream.mockResolvedValue({
      getAudioTracks: () => [track],
    });

    service.setMicrophoneMuted(true);
    await service.produceMicrophone();

    expect(track.enabled).toBe(false);
  });

  it('keeps a mute clicked synchronously after produce starts', async () => {
    const track = {
      enabled: true,
      muted: false,
      readyState: 'live',
    } as MediaStreamTrack;
    const produce = vi.fn().mockResolvedValue({
      track,
      on: vi.fn(),
      closed: false,
    });
    service['sendTransport'] = { produce, closed: false } as never;
    getStream.mockResolvedValue({
      getAudioTracks: () => [track],
    });

    const pending = service.produceMicrophone();
    service.setMicrophoneMuted(true);
    await pending;

    expect(track.enabled).toBe(false);
  });

  it('applies a mute that arrives while getStream is in flight', async () => {
    let resolveStream: (stream: {
      getAudioTracks: () => MediaStreamTrack[];
    }) => void = () => undefined;
    const track = {
      enabled: true,
      muted: false,
      readyState: 'live',
    } as MediaStreamTrack;
    const produce = vi.fn().mockResolvedValue({
      track,
      on: vi.fn(),
      closed: false,
    });
    service['sendTransport'] = { produce, closed: false } as never;
    getStream.mockReturnValue(
      new Promise((resolve) => {
        resolveStream = resolve;
      }),
    );

    const pending = service.produceMicrophone();
    await vi.waitFor(() => {
      expect(getStream).toHaveBeenCalled();
    });
    service.setMicrophoneMuted(true);
    resolveStream({ getAudioTracks: () => [track] });
    await pending;

    expect(track.enabled).toBe(false);
  });

  it('reproduces a muted track after trackended', async () => {
    const producedTracks: Array<{ enabled: boolean }> = [];
    const trackEndedHandlers: Array<() => void> = [];
    const produce = vi.fn().mockImplementation(async () => {
      const track = { enabled: true };
      producedTracks.push(track);
      return {
        track,
        closed: false,
        close: vi.fn(),
        on: (event: string, handler: () => void) => {
          if (event === 'trackended') {
            trackEndedHandlers.push(handler);
          }
        },
      };
    });
    service['sendTransport'] = { produce, closed: false } as never;
    getStream.mockResolvedValue({
      getAudioTracks: () => [
        { enabled: true, muted: false, readyState: 'live' },
      ],
    });

    await service.produceMicrophone();
    service.setMicrophoneMuted(true);
    trackEndedHandlers[0]?.();
    await vi.waitFor(() => {
      expect(produce).toHaveBeenCalledTimes(2);
    });

    expect(producedTracks[1]?.enabled).toBe(false);
  });

  it('keeps a single open producer when produce overlaps', async () => {
    const producers: Array<{
      close: ReturnType<typeof vi.fn>;
      closed: boolean;
    }> = [];
    const produce = vi.fn().mockImplementation(async () => {
      const producer = {
        track: { enabled: true },
        on: vi.fn(),
        closed: false,
        close: vi.fn(),
      };
      producer.close.mockImplementation(() => {
        producer.closed = true;
      });
      producers.push(producer);
      return producer;
    });
    service['sendTransport'] = { produce, closed: false } as never;
    getStream.mockResolvedValue({
      getAudioTracks: () => [
        { enabled: true, muted: false, readyState: 'live' },
      ],
    });

    await Promise.all([
      service.produceMicrophone(),
      service.produceMicrophone(),
    ]);

    expect(producers).toHaveLength(2);
    expect(producers[0]?.closed).toBe(true);
    expect(producers[1]?.closed).toBe(false);
    expect(service['microphoneProducer']).toBe(producers[1]);
  });

  it('replaces the microphone track and keeps the mute state', async () => {
    const replaceTrack = vi.fn().mockResolvedValue(undefined);
    const current = { enabled: true } as MediaStreamTrack;
    const next = { enabled: true } as MediaStreamTrack;
    service['microphoneProducer'] = {
      replaceTrack,
      track: current,
      closed: false,
    } as never;
    service.setMicrophoneMuted(true);

    await service.replaceMicrophoneTrack(next);

    expect(next.enabled).toBe(false);
    expect(replaceTrack).toHaveBeenCalledWith({ track: next });
  });

  it('rethrows opt-in consume errors and swallows auto-consume errors', async () => {
    service['device'] = { recvRtpCapabilities: {} } as never;
    service['recvTransport'] = {
      id: 'recv',
      closed: false,
      consume: vi.fn().mockRejectedValue(new Error('consume failed')),
    } as never;
    const data = {
      producerId: 'p-screen',
      userId: 2,
      kind: 'video' as const,
      mediaTag: 'screen' as const,
    };
    const resolvePeer = () => ({ gain: 1, speakerMuted: false });

    await expect(
      service.consumeProducer(data, resolvePeer, { rethrow: true }),
    ).rejects.toThrow('consume failed');

    await expect(
      service.consumeProducer(data, resolvePeer),
    ).resolves.toBeUndefined();
  });

  it('tracks live consumer ids in consume flow and removes on observer close', async () => {
    let onClose: (() => void) | undefined;
    const fakeConsumer = {
      id: 'consumer-42',
      producerId: 'p-audio',
      resume: vi.fn(),
      observer: {
        once: vi.fn((event: string, handler: () => void) => {
          if (event === 'close') {
            onClose = handler;
          }
        }),
      },
    };
    service['device'] = { recvRtpCapabilities: {} } as never;
    service['recvTransport'] = {
      id: 'recv',
      closed: false,
      consume: vi.fn().mockResolvedValue(fakeConsumer),
    } as never;
    const data = {
      producerId: 'p-audio',
      userId: 2,
      kind: 'audio' as const,
      mediaTag: 'mic' as const,
    };
    const resolvePeer = () => ({ gain: 1, speakerMuted: false });

    await service.consumeProducer(data, resolvePeer);

    expect(service['liveConsumerIds'].has('consumer-42')).toBe(true);

    onClose?.();
    expect(service['liveConsumerIds'].has('consumer-42')).toBe(false);
  });

  it('keeps a video consumer out of the live set until resume', async () => {
    const fakeConsumer = {
      id: 'consumer-video',
      producerId: 'p-cam',
      kind: 'video',
      paused: false,
      closed: false,
      track: {},
      pause() {
        this.paused = true;
      },
      resume() {
        this.paused = false;
      },
      observer: { once: vi.fn() },
    };
    service['device'] = { recvRtpCapabilities: {} } as never;
    service['recvTransport'] = {
      id: 'recv',
      closed: false,
      consume: vi.fn().mockResolvedValue(fakeConsumer),
    } as never;

    await service.consumeProducer(
      {
        producerId: 'p-cam',
        userId: 2,
        kind: 'video',
        mediaTag: 'cam',
      },
      () => ({ gain: 1, speakerMuted: false }),
    );

    expect(fakeConsumer.paused).toBe(true);
    expect(service['liveConsumerIds'].has('consumer-video')).toBe(false);

    await service.resumeConsumer('consumer-video');
    expect(emitWithAck).toHaveBeenCalledWith(EVoiceRoomEvent.RESUME_CONSUMER, {
      consumerId: 'consumer-video',
    });
    expect(fakeConsumer.paused).toBe(false);
    expect(service['liveConsumerIds'].has('consumer-video')).toBe(true);

    await service.pauseConsumer('consumer-video');
    expect(service['liveConsumerIds'].has('consumer-video')).toBe(false);
    expect(fakeConsumer.paused).toBe(true);

    await service.resumeConsumer('consumer-video');
    fakeConsumer.observer.once.mock.calls[0]?.[1]?.();
    fakeConsumer.observer.once.mock.calls[0]?.[1]?.();
    expect(service['liveConsumerIds'].has('consumer-video')).toBe(false);
  });

  it('leaves pause and resume state unchanged when the emit fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fakeConsumer = {
      id: 'consumer-video',
      paused: false,
      closed: false,
      pause: vi.fn(),
      resume: vi.fn(),
    };
    service['consumerRegistry'].add(fakeConsumer as never);
    emitWithAck.mockRejectedValueOnce(new Error('nope'));

    await service.pauseConsumer('consumer-video');

    expect(fakeConsumer.pause).not.toHaveBeenCalled();
    expect(service['liveConsumerIds'].has('consumer-video')).toBe(false);
    expect(warn).toHaveBeenCalled();

    fakeConsumer.paused = true;
    emitWithAck.mockRejectedValueOnce(new Error('nope'));
    await service.resumeConsumer('consumer-video');
    expect(fakeConsumer.resume).not.toHaveBeenCalled();
    expect(service['liveConsumerIds'].has('consumer-video')).toBe(false);
  });

  it('finishes stop screen when the server already closed screen-audio', async () => {
    const videoClose = vi.fn();
    const audioClose = vi.fn();
    service['screenVideoProducer'] = {
      id: 'screen-1',
      closed: false,
      close: videoClose,
    } as never;
    service['screenAudioProducer'] = {
      id: 'screen-audio-1',
      closed: false,
      close: audioClose,
    } as never;

    await service.stopScreen();

    expect(emitWithAck).toHaveBeenCalledTimes(2);
    expect(videoClose).toHaveBeenCalled();
    expect(audioClose).toHaveBeenCalled();
    expect(releaseScreen).toHaveBeenCalled();
  });

  describe('resume helpers', () => {
    const fakeTransport = (id: string, connectionState = 'connected') => ({
      id,
      closed: false,
      connectionState,
      restartIce: vi.fn().mockResolvedValue(undefined),
    });

    it('reports healthy transports only when both are live', () => {
      service['sendTransport'] = fakeTransport('s') as never;
      service['recvTransport'] = fakeTransport('r', 'new') as never;
      expect(service.transportsHealthy()).toBe(true);

      service['recvTransport'] = fakeTransport('r', 'disconnected') as never;
      expect(service.transportsHealthy()).toBe(false);

      service['recvTransport'] = null;
      expect(service.transportsHealthy()).toBe(false);
    });

    it('restarts ICE on both transports with server parameters', async () => {
      const send = fakeTransport('s');
      const recv = fakeTransport('r');
      service['sendTransport'] = send as never;
      service['recvTransport'] = recv as never;
      emitWithAck.mockResolvedValue({ iceParameters: { password: 'p' } });

      await service.restartIce();

      expect(emitWithAck).toHaveBeenCalledWith(EVoiceRoomEvent.RESTART_ICE, {
        transportId: 's',
      });
      expect(emitWithAck).toHaveBeenCalledWith(EVoiceRoomEvent.RESTART_ICE, {
        transportId: 'r',
      });
      expect(send.restartIce).toHaveBeenCalledWith({
        iceParameters: { password: 'p' },
      });
      expect(recv.restartIce).toHaveBeenCalled();
    });
  });

  it('creates transport using the 10 s timeout', async () => {
    service['device'] = {
      loaded: true,
      createSendTransport: vi.fn().mockReturnValue({ on: vi.fn() }),
    } as never;

    await service['createTransport']('send');

    expect(socketTimeout).toHaveBeenCalledWith(10000);
  });

  it('retries PRODUCE once on ack timeout', async () => {
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    const transport = {
      id: 't-1',
      on: (event: string, handler: (...args: unknown[]) => void) => {
        listeners[event] = handler;
      },
    };
    service['device'] = {
      loaded: true,
      createSendTransport: vi.fn().mockReturnValue(transport),
    } as never;

    await service['createTransport']('send');

    const produceHandler = listeners['produce'];
    expect(produceHandler).toBeDefined();

    emitWithAck
      .mockRejectedValueOnce(new Error('operation timed out'))
      .mockResolvedValueOnce({ producerId: 'prod-retry' });

    const callback = vi.fn();
    const errback = vi.fn();

    await produceHandler(
      {
        kind: 'video',
        rtpParameters: {} as never,
        appData: { mediaTag: 'cam' },
      },
      callback,
      errback,
    );

    expect(emitWithAck).toHaveBeenCalledTimes(3);
    expect(socketTimeout).toHaveBeenCalledWith(10000);
    expect(callback).toHaveBeenCalledWith({ id: 'prod-retry' });
    expect(errback).not.toHaveBeenCalled();
  });

  it('plays stream start and stop audio cues for camera produce and stop', async () => {
    service['device'] = {
      loaded: true,
      rtpCapabilities: {
        codecs: [{ mimeType: 'video/VP8' }],
      },
    } as never;
    const produce = vi.fn().mockResolvedValue({
      id: 'cam-prod',
      closed: false,
      on: vi.fn(),
      close: vi.fn(),
    });
    service['sendTransport'] = { produce, closed: false } as never;
    TestBed.inject(CameraService).getTrack = vi
      .fn()
      .mockResolvedValue({ id: 'cam-track' } as MediaStreamTrack);

    await service.produceCamera();
    expect(audioService.playStreamStartAudio).toHaveBeenCalledTimes(1);
    expect(audioService.playStreamStopAudio).not.toHaveBeenCalled();

    await service.stopCamera();
    expect(audioService.playStreamStopAudio).toHaveBeenCalledTimes(1);
  });

  it('plays stream start audio on produceScreen and stop audio on trackended', async () => {
    service['device'] = {
      loaded: true,
      rtpCapabilities: {
        codecs: [{ mimeType: 'video/VP8' }],
      },
    } as never;
    let trackEndedHandler: (() => void) | undefined;
    const videoProducer = {
      id: 'scr-prod',
      closed: false,
      close: vi.fn(),
      on: (event: string, handler: () => void) => {
        if (event === 'trackended') {
          trackEndedHandler = handler;
        }
      },
    };
    const produce = vi.fn().mockResolvedValue(videoProducer);
    service['sendTransport'] = { produce, closed: false } as never;
    TestBed.inject(ScreenCaptureService).getTracks = vi.fn().mockResolvedValue({
      videoTrack: { id: 'scr-track' } as MediaStreamTrack,
    });

    await service.produceScreen();
    expect(audioService.playStreamStartAudio).toHaveBeenCalledTimes(1);

    trackEndedHandler?.();
    await vi.waitFor(() => {
      expect(audioService.playStreamStopAudio).toHaveBeenCalledTimes(1);
    });
  });

  it('produces microphone with Opus codecOptions and starts VoiceQualityService', async () => {
    const track = {
      enabled: true,
      muted: false,
      readyState: 'live',
    } as MediaStreamTrack;
    const produce = vi.fn().mockResolvedValue({
      id: 'mic-prod-1',
      track,
      on: vi.fn(),
      closed: false,
    });
    service['sendTransport'] = { produce, closed: false } as never;
    getStream.mockResolvedValue({
      getAudioTracks: () => [track],
    });

    await service.produceMicrophone();

    expect(produce).toHaveBeenCalledWith(
      expect.objectContaining({
        appData: { mediaTag: 'mic' },
        codecOptions: {
          opusStereo: false,
          opusFec: true,
          opusDtx: true,
          opusMaxPlaybackRate: 48000,
          opusMaxAverageBitrate: 64000,
          opusPtime: 20,
        },
        encodings: [
          {
            priority: 'high',
            networkPriority: 'high',
          },
        ],
      }),
    );
    expect(voiceQualityService.start).toHaveBeenCalledTimes(1);
    expect(voiceQualityService.start).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tier: EVoiceQualityTier.EXCELLENT,
          kbps: 64,
        }),
      ]),
      expect.objectContaining({
        readSample: expect.any(Function),
        applyQualityLevel: expect.any(Function),
      }),
    );
  });

  it('stops VoiceQualityService on cleanup', () => {
    service.cleanup();
    expect(voiceQualityService.stop).toHaveBeenCalledTimes(1);
  });

  it('stops VoiceQualityService if produceMicrophone fails', async () => {
    service['sendTransport'] = {
      produce: vi.fn().mockRejectedValue(new Error('produce failed')),
      closed: false,
    } as never;
    getStream.mockResolvedValue({
      getAudioTracks: () => [
        { enabled: true, muted: false, readyState: 'live' },
      ],
    });

    await service.produceMicrophone();

    expect(voiceQualityService.stop).toHaveBeenCalled();
  });

  it('applies quality levels to audio and video producers', async () => {
    const setMicEncoding = vi.fn().mockResolvedValue(undefined);
    const setCamEncoding = vi.fn().mockResolvedValue(undefined);
    const camPause = vi.fn();
    const camResume = vi.fn();

    const micProducer = {
      id: 'mic-1',
      closed: false,
      setRtpEncodingParameters: setMicEncoding,
    };
    const getParameters = vi.fn().mockReturnValue({
      encodings: [{ maxBitrate: 2_500_000, maxFramerate: 30 }],
    });
    const setParameters = vi.fn().mockResolvedValue(undefined);
    const camProducer = {
      id: 'cam-1',
      closed: false,
      paused: false,
      pause: camPause,
      resume: camResume,
      setRtpEncodingParameters: setCamEncoding,
      rtpSender: { getParameters, setParameters },
    };

    service['microphoneProducer'] = micProducer as never;
    service['cameraProducer'] = camProducer as never;
    service['cameraPublish'] = {
      height: 720,
      fps: 30,
      contentMode: 'motion',
      layers: 1,
      maxBitrateBps: 2_500_000,
    };

    // Apply Tier 1 (GOOD, 40 kbps, 1.2M video cap)
    await service.applyQualityLevel({
      tier: EVoiceQualityTier.GOOD,
      kbps: 40,
    });
    expect(setMicEncoding).toHaveBeenCalledWith({ maxBitrate: 40000 });
    expect(setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        encodings: [expect.objectContaining({ maxBitrate: 1_200_000 })],
      }),
    );
    expect(setCamEncoding).not.toHaveBeenCalled();
    expect(camPause).not.toHaveBeenCalled();

    // Apply Tier 2 (UNSTABLE, 24 kbps, 400k video cap)
    await service.applyQualityLevel({
      tier: EVoiceQualityTier.UNSTABLE,
      kbps: 24,
    });
    expect(setMicEncoding).toHaveBeenCalledWith({ maxBitrate: 24000 });
    expect(setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        encodings: [expect.objectContaining({ maxBitrate: 400_000 })],
      }),
    );
    expect(camPause).not.toHaveBeenCalled();

    // Apply Tier 3 (BAD / POOR, 16 kbps -> pause video)
    await service.applyQualityLevel({
      tier: EVoiceQualityTier.BAD,
      kbps: 16,
    });
    expect(setMicEncoding).toHaveBeenCalledWith({ maxBitrate: 16000 });
    expect(camPause).toHaveBeenCalledTimes(1);
    camProducer.paused = true;

    // Recover to Tier 0 (EXCELLENT, 64 kbps -> resume video and clear cap)
    await service.applyQualityLevel({
      tier: EVoiceQualityTier.EXCELLENT,
      kbps: 64,
    });
    expect(setMicEncoding).toHaveBeenCalledWith({ maxBitrate: 64000 });
    expect(camResume).toHaveBeenCalledTimes(1);
    expect(setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        encodings: [expect.objectContaining({ maxBitrate: 2_500_000 })],
      }),
    );
  });

  it('reads quality sample from mic producer stats and producer score', async () => {
    const statsMap = new Map<string, Record<string, unknown>>([
      [
        'remote-rtp-1',
        {
          type: 'remote-inbound-rtp',
          fractionLost: 0.05,
          roundTripTime: 0.12,
          jitter: 0.03,
        },
      ],
    ]);

    const micProducer = {
      id: 'mic-1',
      closed: false,
      getStats: vi.fn().mockResolvedValue(statsMap),
    };
    service['microphoneProducer'] = micProducer as never;

    // Find the PRODUCER_SCORE listener passed to socket.on
    const scoreCall = socketOn.mock.calls.find(
      (call) => call[0] === EVoiceRoomEvent.PRODUCER_SCORE,
    );
    expect(scoreCall).toBeDefined();
    const scoreListener = scoreCall?.[1];

    // Emit score for different producer -> ignored
    scoreListener({ producerId: 'other-id', score: 5 });
    let sample = await service.readQualitySample();
    expect(sample.score).toBeNull();

    // Emit score for active mic producer -> updated
    scoreListener({ producerId: 'mic-1', score: 8 });
    sample = await service.readQualitySample();

    expect(sample).toEqual({
      score: 8,
      loss: 5,
      rttMs: 120,
      jitterMs: 30,
    });
  });

  describe('watchdog and connection health', () => {
    it('sets stalled flag when stats counters freeze for VOICE_STALL_MS', async () => {
      vi.useFakeTimers();
      const connectionStore = TestBed.inject(VoiceConnectionStore);

      const fakeStats = new Map([
        [
          'report-1',
          {
            type: 'candidate-pair',
            nominated: true,
            bytesSent: 1000,
            bytesReceived: 500,
          },
        ],
      ]);

      const mockTransport = {
        connectionState: 'connected',
        closed: false,
        getStats: vi.fn().mockImplementation(async () => fakeStats),
        on: vi.fn(),
        close: vi.fn(),
      };

      service['sendTransport'] = mockTransport as never;
      service['startWatchdog']();

      // First tick
      await vi.advanceTimersByTimeAsync(VOICE_WATCHDOG_INTERVAL_MS);
      expect(connectionStore.stalled()).toBe(false);

      // Advance time past stall threshold without byte growth
      await vi.advanceTimersByTimeAsync(
        VOICE_STALL_MS + VOICE_WATCHDOG_INTERVAL_MS,
      );
      expect(connectionStore.stalled()).toBe(true);

      // Growing only bytesSent does not clear stall
      fakeStats.set('report-1', {
        type: 'candidate-pair',
        nominated: true,
        bytesSent: 2000,
        bytesReceived: 500,
      });
      await vi.advanceTimersByTimeAsync(VOICE_WATCHDOG_INTERVAL_MS);
      expect(connectionStore.stalled()).toBe(true);

      // Growing bytesReceived clears stall
      fakeStats.set('report-1', {
        type: 'candidate-pair',
        nominated: true,
        bytesSent: 2000,
        bytesReceived: 1000,
      });
      await vi.advanceTimersByTimeAsync(VOICE_WATCHDOG_INTERVAL_MS);
      expect(connectionStore.stalled()).toBe(false);

      // Rejection does not cause stall
      mockTransport.getStats.mockRejectedValueOnce(new Error('stats failed'));
      await vi.advanceTimersByTimeAsync(VOICE_WATCHDOG_INTERVAL_MS);
      expect(connectionStore.stalled()).toBe(false);

      // Cleanup stops interval and resets store
      service.cleanup();
      expect(service['watchdogInterval']).toBeNull();
      expect(connectionStore.stalled()).toBe(false);

      vi.useRealTimers();
    });

    it('ignores receive liveness while no consumers are alive', async () => {
      vi.useFakeTimers();
      const connectionStore = TestBed.inject(VoiceConnectionStore);

      const fakeStats = new Map([
        [
          'report-1',
          {
            type: 'candidate-pair',
            nominated: true,
            bytesReceived: 500,
          },
        ],
      ]);

      const mockRecvTransport = {
        connectionState: 'connected',
        closed: false,
        getStats: vi.fn().mockImplementation(async () => fakeStats),
        on: vi.fn(),
        close: vi.fn(),
      };

      service['recvTransport'] = mockRecvTransport as never;
      service['startWatchdog']();

      // First tick
      await vi.advanceTimersByTimeAsync(VOICE_WATCHDOG_INTERVAL_MS);
      expect(connectionStore.stalled()).toBe(false);

      // With connected recv transport, frozen bytesReceived, and no live consumers, stalled() stays false after VOICE_STALL_MS
      await vi.advanceTimersByTimeAsync(
        VOICE_STALL_MS + VOICE_WATCHDOG_INTERVAL_MS,
      );
      expect(connectionStore.stalled()).toBe(false);

      // After one consumer is added and frozen bytesReceived persists for VOICE_STALL_MS, stalled() becomes true
      let onClose: (() => void) | undefined;
      const fakeConsumer = {
        id: 'consumer-1',
        observer: {
          once: vi.fn((event: string, handler: () => void) => {
            if (event === 'close') {
              onClose = handler;
            }
          }),
        },
      };

      service['liveConsumerIds'].add(fakeConsumer.id);
      fakeConsumer.observer.once('close', () => {
        service['liveConsumerIds'].delete(fakeConsumer.id);
      });
      expect(service['liveConsumerIds'].size).toBe(1);

      // Advance through tick with consumer present
      await vi.advanceTimersByTimeAsync(VOICE_WATCHDOG_INTERVAL_MS);
      expect(connectionStore.stalled()).toBe(false);

      // Frozen bytesReceived persists for VOICE_STALL_MS
      await vi.advanceTimersByTimeAsync(
        VOICE_STALL_MS + VOICE_WATCHDOG_INTERVAL_MS,
      );
      expect(connectionStore.stalled()).toBe(true);

      // After that consumer closes (observer close), stalled() returns to false on the next tick
      onClose?.();
      expect(service['liveConsumerIds'].size).toBe(0);

      await vi.advanceTimersByTimeAsync(VOICE_WATCHDOG_INTERVAL_MS);
      expect(connectionStore.stalled()).toBe(false);

      // cleanup() empties the consumer set
      service['liveConsumerIds'].add('consumer-2');
      expect(service['liveConsumerIds'].size).toBe(1);
      service.cleanup();
      expect(service['liveConsumerIds'].size).toBe(0);

      vi.useRealTimers();
    });

    it('does not stall when video is paused, with or without live audio', async () => {
      vi.useFakeTimers();
      const connectionStore = TestBed.inject(VoiceConnectionStore);
      let bytes = 500;
      let freeze = false;
      service['recvTransport'] = {
        connectionState: 'connected',
        closed: false,
        getStats: vi.fn().mockImplementation(async () => {
          if (!freeze) {
            bytes += 1;
          }
          return new Map([
            [
              'report-1',
              { type: 'candidate-pair', nominated: true, bytesReceived: bytes },
            ],
          ]);
        }),
        on: vi.fn(),
        close: vi.fn(),
      } as never;
      service['liveConsumerIds'].add('audio-1');
      service['startWatchdog']();

      await vi.advanceTimersByTimeAsync(
        VOICE_STALL_MS + VOICE_WATCHDOG_INTERVAL_MS,
      );
      expect(connectionStore.stalled()).toBe(false);
      expect(service['liveConsumerIds'].has('audio-1')).toBe(true);

      service['liveConsumerIds'].clear();
      freeze = true;
      await vi.advanceTimersByTimeAsync(
        VOICE_STALL_MS + VOICE_WATCHDOG_INTERVAL_MS,
      );
      expect(connectionStore.stalled()).toBe(false);

      vi.useRealTimers();
    });
  });

  it('publishes per-layer encodings and forwards sourceHeight', async () => {
    service['device'] = {
      loaded: true,
      rtpCapabilities: { codecs: [{ mimeType: 'video/VP8' }] },
    } as never;
    const produce = vi.fn().mockResolvedValue({
      id: 'cam-prod',
      closed: false,
      on: vi.fn(),
      close: vi.fn(),
    });
    service['sendTransport'] = { produce, closed: false } as never;
    TestBed.inject(CameraService).getTrack = vi.fn().mockResolvedValue({
      getSettings: () => ({ height: 360 }),
    } as MediaStreamTrack);
    const settings = TestBed.inject(SettingsStore);
    settings.streamLayers = vi
      .fn()
      .mockReturnValue(3) as unknown as typeof settings.streamLayers;

    await service.produceCamera();

    const options = produce.mock.calls[0]?.[0] as {
      encodings: Array<{
        scalabilityMode: string;
        scaleResolutionDownBy: number;
        maxBitrate: number;
      }>;
      appData: { sourceHeight: number };
    };
    expect(options.encodings).toHaveLength(2);
    expect(options.encodings[0]?.scalabilityMode).toBe('L1T1');
    expect(options.encodings[0]?.scaleResolutionDownBy).toBe(2);
    expect(options.encodings[1]?.scaleResolutionDownBy).toBe(1);
    const sum = options.encodings.reduce(
      (total, encoding) => total + encoding.maxBitrate,
      0,
    );
    expect(sum).toBeLessThanOrEqual(2_500_000);
    expect(options.appData.sourceHeight).toBe(360);

    const listeners: Record<string, (...args: unknown[]) => unknown> = {};
    service['sendTransport'] = {
      produce,
      closed: false,
      on: (event: string, handler: (...args: unknown[]) => unknown) => {
        listeners[event] = handler;
      },
    } as never;
    service['device'] = {
      loaded: true,
      createSendTransport: vi
        .fn()
        .mockImplementation(() => service['sendTransport']),
    } as never;
    await service['createTransport']('send');
    await listeners['produce']?.(
      {
        kind: 'video',
        rtpParameters: {},
        appData: { mediaTag: 'cam', sourceHeight: 360 },
      },
      vi.fn(),
      vi.fn(),
    );
    expect(emitWithAck).toHaveBeenCalledWith(
      EVoiceRoomEvent.PRODUCE,
      expect.objectContaining({ sourceHeight: 360, mediaTag: 'cam' }),
    );
  });

  it('warns once when the browser applies different screen encodings', async () => {
    const open = TestBed.inject(TuiNotificationService).open as ReturnType<
      typeof vi.fn
    >;
    const plan = [
      {
        scaleResolutionDownBy: 4,
        height: 270,
        maxFramerate: 10,
        maxBitrate: 200_000,
      },
      {
        scaleResolutionDownBy: 2,
        height: 540,
        maxFramerate: 15,
        maxBitrate: 400_000,
      },
      {
        scaleResolutionDownBy: 1,
        height: 1080,
        maxFramerate: 30,
        maxBitrate: 4_400_000,
      },
    ];
    const producer = {
      rtpSender: {
        getParameters: () => ({
          encodings: [{ scaleResolutionDownBy: 1, maxBitrate: 4_400_000 }],
        }),
      },
    };
    service['verifyAppliedEncodings'](producer as never, plan);
    service['verifyAppliedEncodings'](producer as never, plan);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      'CALL.STREAM_SETTINGS_NOT_APPLIED',
      expect.objectContaining({ appearance: 'warning' }),
    );

    service['screenSettingsWarned'] = false;
    const top = plan[2];
    if (!top) {
      throw new Error('missing top layer');
    }
    service['verifyAppliedEncodings'](producer as never, [top]);
    expect(open).toHaveBeenCalledTimes(1);

    service['verifyAppliedEncodings']({ rtpSender: undefined } as never, plan);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('passes the screen content mode into capture', async () => {
    service['device'] = {
      loaded: true,
      rtpCapabilities: { codecs: [{ mimeType: 'video/VP8' }] },
    } as never;
    const produce = vi.fn().mockResolvedValue({
      id: 'scr',
      closed: false,
      on: vi.fn(),
      close: vi.fn(),
    });
    service['sendTransport'] = { produce, closed: false } as never;
    const getTracks = vi.fn().mockResolvedValue({
      videoTrack: { getSettings: () => ({ height: 1080 }) },
      audioTrack: null,
    });
    TestBed.inject(ScreenCaptureService).getTracks = getTracks;
    const screenSettings = TestBed.inject(SettingsStore);
    screenSettings.screenContentMode = vi
      .fn()
      .mockReturnValue(
        'motion',
      ) as unknown as typeof screenSettings.screenContentMode;

    await service.produceScreen();

    expect(getTracks).toHaveBeenCalledWith({ contentMode: 'motion' });
    expect(TestBed.inject(TuiNotificationService).open).not.toHaveBeenCalled();
  });

  it('emits set-consumer-layers and warns when the ack fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await service.setConsumerPreferredLayer('c1', 1);
    expect(emitWithAck).toHaveBeenCalledWith(
      EVoiceRoomEvent.SET_CONSUMER_LAYERS,
      { consumerId: 'c1', spatialLayer: 1 },
    );

    emitWithAck.mockRejectedValueOnce(new Error('nope'));
    await service.setConsumerPreferredLayer('c1', 2);
    expect(warn).toHaveBeenCalled();
  });
});
