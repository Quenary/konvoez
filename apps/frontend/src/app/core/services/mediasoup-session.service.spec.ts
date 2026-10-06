import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { MicrophoneService } from './microphone.service';
import { PeerPlaybackService } from './peer-playback.service';
import { PeerVideoService } from './peer-video.service';
import { CameraService } from './camera.service';
import { ScreenCaptureService } from './screen-capture.service';
import { PeerScreenAudioService } from './peer-screen-audio.service';
import { MediasoupSessionService } from './mediasoup-session.service';

describe('MediasoupSessionService', () => {
  let service: MediasoupSessionService;
  let getStream: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getStream = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        MediasoupSessionService,
        {
          provide: VoiceRoomSocketToken,
          useValue: {
            emitWithAck: vi.fn(),
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
            setLocalCamTrack: vi.fn(),
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
            release: vi.fn(),
          },
        },
        {
          provide: ScreenCaptureService,
          useValue: {
            getTracks: vi.fn(),
            release: vi.fn(),
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
      ],
    });
    service = TestBed.inject(MediasoupSessionService);
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
});
