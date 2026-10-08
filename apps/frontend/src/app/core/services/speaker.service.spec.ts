import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeakerService } from './speaker.service';

describe('SpeakerService', () => {
  let service: SpeakerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SpeakerService],
    });

    service = TestBed.inject(SpeakerService);
  });

  afterEach(() => {
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

  it('keeps a single limiter on the mix bus across playback requests', async () => {
    const limiters: Array<{
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      port: { postMessage: ReturnType<typeof vi.fn> };
    }> = [];
    const destination = { kind: 'speakers' };
    const busConnect = vi.fn();
    class FakeContext {
      state = 'running';
      destination = destination;
      audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      resume = vi.fn();
      createGain() {
        return { connect: busConnect, disconnect: vi.fn(), gain: { value: 1 } };
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

    const first = await service.getOutput();
    const second = await service.getOutput();

    expect(second).toBe(first);
    expect(limiters).toHaveLength(1);
    expect(busConnect).toHaveBeenCalledTimes(1);
    expect(busConnect).toHaveBeenCalledWith(limiters[0]);
    expect(limiters[0].connect).toHaveBeenCalledWith(destination);
  });
});
