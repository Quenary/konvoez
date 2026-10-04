import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { MicrophoneService } from './microphone.service';
import { PeerPlaybackService } from './peer-playback.service';
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

    await service.produceMicrophone(false);

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

    const pending = service.produceMicrophone(false);
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
    const produce = vi.fn().mockImplementation(async () => ({
      track: { enabled: true },
      on: (event: string, handler: () => void) => {
        if (event === 'trackended') {
          trackEndedHandlers.push(handler);
        }
      },
    }));
    service['sendTransport'] = { produce, closed: false } as never;
    getStream.mockResolvedValue({
      getAudioTracks: () => [
        { enabled: true, muted: false, readyState: 'live' },
      ],
    });

    await service.produceMicrophone(false);
    expect(produce).toHaveBeenCalledTimes(1);
    expect(trackEndedHandlers).toHaveLength(1);

    const endedHandler = trackEndedHandlers.at(0);
    expect(endedHandler).toBeTypeOf('function');
    endedHandler?.();
    await vi.waitFor(() => {
      expect(produce).toHaveBeenCalledTimes(2);
    });
  });
});
