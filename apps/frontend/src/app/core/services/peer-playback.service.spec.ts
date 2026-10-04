import { TestBed } from '@angular/core/testing';
import type { Consumer } from 'mediasoup-client/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioActivityService } from './audio-activity.service';
import { PeerPlaybackService } from './peer-playback.service';
import { SpeakerService } from './speaker.service';

describe('PeerPlaybackService', () => {
  let service: PeerPlaybackService;
  let resolveContext: (context: AudioContext) => void = () => undefined;
  let getContext: ReturnType<typeof vi.fn>;
  let sourceDisconnect: ReturnType<typeof vi.fn>;
  let register: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sourceDisconnect = vi.fn();
    register = vi.fn();
    getContext = vi.fn(
      () =>
        new Promise<AudioContext>((resolve) => {
          resolveContext = resolve;
        }),
    );
    vi.stubGlobal(
      'MediaStream',
      class MediaStream {
        constructor(readonly tracks: readonly MediaStreamTrack[]) {}
      },
    );

    TestBed.configureTestingModule({
      providers: [
        PeerPlaybackService,
        { provide: SpeakerService, useValue: { getContext } },
        {
          provide: AudioActivityService,
          useValue: { register, unregister: vi.fn() },
        },
      ],
    });
    service = TestBed.inject(PeerPlaybackService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function context(): AudioContext {
    return {
      destination: {},
      createMediaStreamSource: () => ({
        connect: vi.fn(),
        disconnect: sourceDisconnect,
      }),
      createGain: () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 1 },
      }),
      createAnalyser: () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        fftSize: 0,
        smoothingTimeConstant: 0,
      }),
    } as unknown as AudioContext;
  }

  function consumer(): Consumer & { close: ReturnType<typeof vi.fn> } {
    return {
      track: {} as MediaStreamTrack,
      closed: false,
      close: vi.fn(),
      on: vi.fn(),
    } as unknown as Consumer & { close: ReturnType<typeof vi.fn> };
  }

  it('drops nodes built after the peer leaves during attach', async () => {
    const remote = consumer();
    const pending = service.attach(7, remote, {
      gain: 1,
      speakerMuted: false,
    });
    service.detach(7);
    resolveContext(context());
    await pending;

    expect(sourceDisconnect).toHaveBeenCalled();
    expect(remote.close).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
    expect(service['graphs'].has(7)).toBe(false);
  });

  it('closes the consumer when it ends while the audio context is opening', async () => {
    const remote = consumer();
    const pending = service.attach(7, remote, { gain: 1, speakerMuted: false });
    Object.assign(remote, { closed: true });
    resolveContext(context());
    await pending;

    expect(sourceDisconnect).toHaveBeenCalled();
    expect(remote.close).not.toHaveBeenCalled();
    expect(service['graphs'].has(7)).toBe(false);
  });
});
