import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeerScreenAudioService } from './peer-screen-audio.service';
import { SpeakerService } from './speaker.service';

describe('PeerScreenAudioService', () => {
  let service: PeerScreenAudioService;
  let output: { disconnect: ReturnType<typeof vi.fn> };
  let gain: {
    gain: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let context: {
    destination: { kind: string };
    createMediaStreamSource: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.stubGlobal(
      'MediaStream',
      class MediaStream {
        constructor(readonly tracks: readonly MediaStreamTrack[] = []) {}
        getAudioTracks() {
          return this.tracks;
        }
        getTracks() {
          return this.tracks;
        }
      },
    );

    output = { disconnect: vi.fn() };
    gain = {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    context = {
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createGain: vi.fn(() => gain),
      destination: { kind: 'speakers' },
    };
    TestBed.configureTestingModule({
      providers: [
        PeerScreenAudioService,
        {
          provide: SpeakerService,
          useValue: {
            getContext: vi.fn().mockResolvedValue(context),
            getOutput: vi.fn().mockResolvedValue(output),
          },
        },
      ],
    });
    service = TestBed.inject(PeerScreenAudioService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches and detaches a screen-audio consumer', async () => {
    const close = vi.fn();
    const consumer = {
      id: 'c1',
      producerId: 'p1',
      track: {},
      closed: false,
      close,
    };
    await service.attach(5, consumer as never, {
      gain: 0.5,
      speakerMuted: false,
    });
    expect(service.getConsumerId(5)).toBe('c1');
    expect(gain.connect).toHaveBeenCalledWith(output);
    service.detach(5);
    expect(output.disconnect).not.toHaveBeenCalled();
    expect(service.getConsumerId(5)).toBeNull();
    expect(close).toHaveBeenCalled();
  });

  it('leaves no graph and connects nothing if detach is called while getOutput is pending', async () => {
    let resolveOutput!: (val: AudioNode) => void;
    const speakerService = TestBed.inject(SpeakerService);
    vi.mocked(speakerService.getOutput).mockReturnValue(
      new Promise((resolve) => {
        resolveOutput = resolve;
      }),
    );

    const close = vi.fn();
    const consumer = {
      id: 'c1',
      producerId: 'p1',
      track: {},
      closed: false,
      close,
    };

    const attachPromise = service.attach(5, consumer as never, {
      gain: 0.5,
      speakerMuted: false,
    });

    service.detach(5);

    resolveOutput(output as unknown as AudioNode);
    await attachPromise;

    expect(service.getConsumerId(5)).toBeNull();
    expect(gain.connect).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('drops nodes and does not connect if consumer closes while getOutput is pending', async () => {
    let resolveOutput!: (val: AudioNode) => void;
    const speakerService = TestBed.inject(SpeakerService);
    vi.mocked(speakerService.getOutput).mockReturnValue(
      new Promise((resolve) => {
        resolveOutput = resolve;
      }),
    );

    const close = vi.fn();
    const consumer = {
      id: 'c1',
      producerId: 'p1',
      track: {},
      closed: false,
      close,
    };

    const attachPromise = service.attach(5, consumer as never, {
      gain: 0.5,
      speakerMuted: false,
    });

    consumer.closed = true;

    resolveOutput(output as unknown as AudioNode);
    await attachPromise;

    expect(service.getConsumerId(5)).toBeNull();
    expect(gain.connect).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
