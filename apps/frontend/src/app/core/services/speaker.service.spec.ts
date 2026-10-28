import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SPEAKER_WORKLET_LOAD_TIMEOUT_MS,
  SpeakerService,
} from './speaker.service';
import { MediaDevicesService } from './media-devices.service';
import { MediaDeviceSwitchNotifierService } from './media-device-switch-notifier.service';

describe('SpeakerService', () => {
  let service: SpeakerService;
  let notify: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    notify = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        SpeakerService,
        {
          provide: MediaDeviceSwitchNotifierService,
          useValue: { notify },
        },
      ],
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

  describe('output device priority', () => {
    const outputs = (...ids: string[]) =>
      ids.map((deviceId) => ({
        kind: 'audiooutput',
        deviceId,
        label: deviceId,
      })) as MediaDeviceInfo[];

    const withContext = (sinkId = '') => {
      const context = {
        state: 'running',
        sinkId,
        setSinkId: vi.fn().mockResolvedValue(undefined),
      };
      service['context'] = context as unknown as AudioContext;
      return context;
    };

    const stubDevices = (devices: MediaDeviceInfo[]) => {
      TestBed.inject(MediaDevicesService).enumerateDevices = vi
        .fn()
        .mockResolvedValue(devices);
    };

    it('uses the chosen output when it is listed', async () => {
      const context = withContext();
      stubDevices(outputs('default', 'communications', 'hp'));
      service['device'] = { deviceId: 'hp', label: 'hp' } as MediaDeviceInfo;

      await service['handleDeviceChange']();

      expect(context.setSinkId).toHaveBeenCalledWith('hp');
    });

    it('falls back to communications when the chosen output is gone', async () => {
      const context = withContext('hp');
      stubDevices(outputs('default', 'communications'));
      service['device'] = { deviceId: 'hp', label: 'hp' } as MediaDeviceInfo;

      await service['handleDeviceChange']();

      expect(context.setSinkId).toHaveBeenCalledWith('communications');
      expect(notify).toHaveBeenCalledWith('audiooutput', 'communications');
    });

    it('does not toast when the sink is set by a manual selection', async () => {
      const context = withContext('hp');
      stubDevices(outputs('default', 'spk'));

      await service.setDevice({
        deviceId: 'spk',
        label: 'spk',
      } as MediaDeviceInfo);

      expect(context.setSinkId).toHaveBeenCalledWith('spk');
      expect(notify).not.toHaveBeenCalled();
    });

    it('falls back to default when communications cannot be used', async () => {
      const context = withContext('hp');
      context.setSinkId.mockRejectedValueOnce(new Error('NotFoundError'));
      stubDevices(outputs('default', 'communications'));

      await service['handleDeviceChange']();

      expect(context.setSinkId.mock.calls.map(([id]) => id)).toEqual([
        'communications',
        'default',
      ]);
    });

    it('does not touch the sink when it already plays to the wanted device', async () => {
      const context = withContext('communications');
      stubDevices(outputs('default', 'communications'));

      await service['handleDeviceChange']();

      expect(context.setSinkId).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    });

    it('does not create a context on devicechange', async () => {
      stubDevices(outputs('default'));

      await service['handleDeviceChange']();

      expect(service['context']).toBeNull();
    });
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
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
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
