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
    });
    service['sendTransport'] = { produce } as never;
    service['microphoneProducer'] = {
      close,
      track: { enabled: true },
    } as never;
    getStream.mockResolvedValue({
      getAudioTracks: () => [{ enabled: true }],
    });

    await service.produceMicrophone(false);

    expect(close).toHaveBeenCalledTimes(1);
    expect(produce).toHaveBeenCalledTimes(1);
  });
});
