import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SPEAKER_WORKLET_LOAD_TIMEOUT_MS,
  SpeakerService,
} from './speaker.service';

describe('SpeakerService', () => {
  let service: SpeakerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SpeakerService],
    });

    service = TestBed.inject(SpeakerService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should release the speaker context and reset the sink', async () => {
    const context = {
      state: 'running',
      close: vi.fn(),
      setSinkId: vi.fn(),
    };

    service['context'] = context as unknown as AudioContext;
    service['device'] = { deviceId: 'speaker-1' } as MediaDeviceInfo;

    await service.release();

    expect(context.setSinkId).toHaveBeenCalledWith('default');
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(service['context']).toBeNull();
  });

  it('does not load the worklet while opening the speaker context', async () => {
    const audio = stubSpeaker(vi.fn(() => new Promise<void>(() => undefined)));

    await service.getContext();

    expect(audio.addModule).not.toHaveBeenCalled();
  });

  it('keeps a single limiter on the mix bus across playback requests', async () => {
    const audio = stubSpeaker(vi.fn().mockResolvedValue(undefined));

    const first = await service.getOutput();
    const second = await service.getOutput();

    expect(second).toBe(first);
    expect(audio.limiters).toHaveLength(1);
    expect(audio.addModule).toHaveBeenCalledTimes(1);
    expect(audio.bus.connect).toHaveBeenCalledWith(audio.master);
    expect(audio.master.connect).toHaveBeenNthCalledWith(1, audio.destination);
    expect(audio.master.disconnect).toHaveBeenCalledTimes(1);
    expect(audio.master.connect).toHaveBeenNthCalledWith(2, audio.limiters[0]);
    expect(audio.limiters[0].connect).toHaveBeenCalledWith(audio.destination);
  });

  it('applies master volume gain before the limiter', async () => {
    const audio = stubSpeaker(vi.fn().mockResolvedValue(undefined));

    service.setMasterVolume(1.5);
    await service.getOutput();

    expect(audio.master.gain.value).toBe(1.5);
    expect(audio.bus.connect).toHaveBeenCalledWith(audio.master);
    expect(audio.master.connect).toHaveBeenCalledWith(audio.limiters[0]);
  });

  it('plays without a limiter when the worklet fails and does not retry', async () => {
    const addModule = vi
      .fn()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(undefined);
    const audio = stubSpeaker(addModule);

    const first = await service.getOutput();
    expect(audio.limiters).toHaveLength(0);
    expect(audio.bus.connect).toHaveBeenCalledWith(audio.master);
    expect(audio.master.connect).toHaveBeenCalledWith(audio.destination);

    const second = await service.getOutput();
    expect(second).toBe(first);
    expect(audio.limiters).toHaveLength(0);
    expect(addModule).toHaveBeenCalledTimes(1);
  });

  it('returns the bus when the worklet load hangs and subsequent calls resolve without waiting', async () => {
    vi.useFakeTimers();
    const audio = stubSpeaker(vi.fn(() => new Promise<void>(() => undefined)));

    const pending = service.getOutput();
    await vi.advanceTimersByTimeAsync(SPEAKER_WORKLET_LOAD_TIMEOUT_MS);
    const output = await pending;

    expect(output).toBe(audio.bus);
    expect(audio.limiters).toHaveLength(0);
    expect(audio.master.connect).toHaveBeenCalledWith(audio.destination);

    const second = await service.getOutput();
    const third = await service.getOutput();
    expect(second).toBe(audio.bus);
    expect(third).toBe(audio.bus);
    expect(audio.limiters).toHaveLength(0);
  });
});

function stubSpeaker(addModule: ReturnType<typeof vi.fn>) {
  const limiters: Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    port: { postMessage: ReturnType<typeof vi.fn> };
  }> = [];
  const destination = { kind: 'speakers' };
  const bus = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
  };
  const master = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
  };
  let gainCalls = 0;
  class FakeContext {
    state = 'running';
    destination = destination;
    audioWorklet = { addModule };
    resume = vi.fn();
    close = vi.fn();
    createGain() {
      return gainCalls++ === 0 ? bus : master;
    }
  }
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      connect = vi.fn();
      disconnect = vi.fn();
      port = { postMessage: vi.fn() };
      constructor() {
        limiters.push(this);
      }
    },
  );
  return { addModule, limiters, destination, bus, master };
}
