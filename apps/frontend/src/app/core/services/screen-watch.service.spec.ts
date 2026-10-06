import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { EVoiceRoomEvent } from '@konvoez/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { MediasoupSessionService } from './mediasoup-session.service';
import { PeerScreenAudioService } from './peer-screen-audio.service';
import { PeerVideoService } from './peer-video.service';
import { ScreenWatchService } from './screen-watch.service';

describe('ScreenWatchService', () => {
  let service: ScreenWatchService;
  let consumeProducer: ReturnType<typeof vi.fn>;
  let emitWithAck: ReturnType<typeof vi.fn>;
  let stopWatchingLocal: ReturnType<typeof vi.fn>;
  let detach: ReturnType<typeof vi.fn>;
  let availableScreens: ReturnType<
    typeof signal<
      Record<number, { videoProducerId: string; audioProducerId?: string }>
    >
  >;
  let watching: ReturnType<typeof signal<ReadonlySet<number>>>;

  const resolvePeer = () => ({ gain: 1, speakerMuted: false });

  beforeEach(() => {
    consumeProducer = vi.fn().mockResolvedValue(undefined);
    emitWithAck = vi.fn().mockResolvedValue(undefined);
    stopWatchingLocal = vi.fn();
    detach = vi.fn();
    availableScreens = signal({
      4: { videoProducerId: 'vid', audioProducerId: 'aud' },
    });
    watching = signal(new Set<number>());

    TestBed.configureTestingModule({
      providers: [
        ScreenWatchService,
        {
          provide: VoiceRoomSocketToken,
          useValue: { emitWithAck },
        },
        {
          provide: MediasoupSessionService,
          useValue: { consumeProducer },
        },
        {
          provide: PeerVideoService,
          useValue: {
            availableScreens: availableScreens.asReadonly(),
            isWatching: (userId: number) => watching().has(userId),
            getScreenConsumerId: () => 'video-consumer',
            stopWatchingLocal,
          },
        },
        {
          provide: PeerScreenAudioService,
          useValue: {
            getConsumerId: () => 'audio-consumer',
            detach,
            remove: vi.fn(),
          },
        },
      ],
    });
    service = TestBed.inject(ScreenWatchService);
  });

  it('subscribes to screen video and audio', async () => {
    await service.watchScreen(4, resolvePeer, 0.5);

    expect(consumeProducer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ producerId: 'vid', mediaTag: 'screen' }),
      resolvePeer,
      { rethrow: true },
    );
    expect(consumeProducer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ producerId: 'aud', mediaTag: 'screen-audio' }),
      resolvePeer,
      { screenGain: 0.5, rethrow: true },
    );
  });

  it('keeps the video watch when screen audio fails', async () => {
    consumeProducer.mockImplementation(async (data: { mediaTag: string }) => {
      if (data.mediaTag === 'screen-audio') {
        throw new Error('audio failed');
      }
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      service.watchScreen(4, resolvePeer, 1),
    ).resolves.toBeUndefined();

    expect(consumeProducer).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rejects when there is no screen video', async () => {
    availableScreens.set({ 4: { videoProducerId: '' } });
    await expect(service.watchScreen(4, resolvePeer, 1)).rejects.toThrow(
      /No screen share/,
    );
    expect(consumeProducer).not.toHaveBeenCalled();
  });

  it('closes both consumers when stopping', async () => {
    await service.stopWatchingScreen(4);

    expect(emitWithAck).toHaveBeenCalledWith(EVoiceRoomEvent.CLOSE_CONSUMER, {
      consumerId: 'video-consumer',
    });
    expect(emitWithAck).toHaveBeenCalledWith(EVoiceRoomEvent.CLOSE_CONSUMER, {
      consumerId: 'audio-consumer',
    });
    expect(stopWatchingLocal).toHaveBeenCalledWith(4);
    expect(detach).toHaveBeenCalledWith(4);
  });
});
