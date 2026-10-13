import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOISE_SUPPRESSOR_PORT,
  type NoiseSuppressorPort,
} from '@core/audio/noise-suppressor.port';
import { SettingsStore } from '@core/stores/settings.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { ENoiseProcessor } from '../../app.enums';
import { MicTestService } from './mic-test.service';

describe('MicTestService', () => {
  let service: MicTestService;
  const previousWorkletNode = globalThis.AudioWorkletNode;

  const noiseSuppressorPort = {
    loadRnnoise: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    loadDeepFilter: vi.fn().mockResolvedValue({} as WebAssembly.Module),
    isSimdSupported: vi.fn().mockReturnValue(true),
    RnnoiseWorkletNode: class RnnoiseWorkletNode {
      connect = vi.fn();
      disconnect = vi.fn();
      destroy = vi.fn();
    },
    DeepFilterWorkletNode: class DeepFilterWorkletNode {
      connect = vi.fn();
      disconnect = vi.fn();
      destroy = vi.fn();
      port = { postMessage: vi.fn() };
    },
  } as unknown as NoiseSuppressorPort;

  let activeSessionVal: unknown = null;

  beforeEach(() => {
    (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode = class {
      connect = vi.fn();
      disconnect = vi.fn();
      port = { postMessage: vi.fn() };
    };

    activeSessionVal = null;

    TestBed.configureTestingModule({
      providers: [
        MicTestService,
        { provide: NOISE_SUPPRESSOR_PORT, useValue: noiseSuppressorPort },
        {
          provide: SettingsStore,
          useValue: {
            noiseProcessor: () => ENoiseProcessor.DEEPFILTER,
            echoCancellation: () => true,
            inputGain: () => 1.5,
          },
        },
        {
          provide: VoiceSessionStore,
          useValue: {
            activeSession: () => activeSessionVal,
          },
        },
      ],
    });

    service = TestBed.inject(MicTestService);
  });

  afterEach(() => {
    (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode =
      previousWorkletNode;
  });

  it('initializes with inactive state and zero level', () => {
    expect(service.isRunning()).toBe(false);
    expect(service.level()).toBe(0);
  });

  it('does not start when an active voice session is present', async () => {
    activeSessionVal = { id: 'call-1' };
    await service.start(null, null);

    expect(service.isRunning()).toBe(false);
  });

  it('starts isolated capture pipeline and stops cleanly', async () => {
    const trackStop = vi.fn();
    const fakeTrack = { stop: trackStop };
    const fakeStream = {
      getTracks: () => [fakeTrack],
      getAudioTracks: () => [fakeTrack],
    } as unknown as MediaStream;

    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
    const makeup = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 1 },
    };
    const biquad = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      frequency: { value: 0 },
      Q: { value: 0 },
      type: '',
    };
    const compressor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
    };
    const analyser = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 64,
      getByteFrequencyData: vi.fn(),
    };
    const destination = { connect: vi.fn() };
    const contextClose = vi.fn();

    let gainCalls = 0;
    class FakeContext {
      sampleRate = 48000;
      state = 'running';
      destination = destination;
      audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      resume = vi.fn();
      close = contextClose;
      createMediaStreamSource = () => source;
      createGain = () => (gainCalls++ === 0 ? gain : makeup);
      createBiquadFilter = () => biquad;
      createDynamicsCompressor = () => compressor;
      createAnalyser = () => analyser;
      setSinkId = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal('AudioContext', FakeContext);

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(fakeStream),
      },
    });

    await service.start(
      { deviceId: 'mic-1' } as MediaDeviceInfo,
      { deviceId: 'spk-1' } as MediaDeviceInfo,
    );

    expect(service.isRunning()).toBe(true);
    expect(gain.gain.value).toBe(1.5);

    await service.stop();

    expect(service.isRunning()).toBe(false);
    expect(service.level()).toBe(0);
    expect(trackStop).toHaveBeenCalled();
    expect(contextClose).toHaveBeenCalled();
  });

  it('restarts without deadlocking when running', async () => {
    const trackStop = vi.fn();
    const fakeTrack = { stop: trackStop };
    const fakeStream = {
      getTracks: () => [fakeTrack],
      getAudioTracks: () => [fakeTrack],
    } as unknown as MediaStream;

    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
    const makeup = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 1 },
    };
    const biquad = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      frequency: { value: 0 },
      Q: { value: 0 },
      type: '',
    };
    const compressor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
    };
    const analyser = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 64,
      getByteFrequencyData: vi.fn(),
    };
    const destination = { connect: vi.fn() };

    let gainCalls = 0;
    class FakeContext {
      sampleRate = 48000;
      state = 'running';
      destination = destination;
      audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      resume = vi.fn();
      close = vi.fn().mockResolvedValue(undefined);
      createMediaStreamSource = () => source;
      createGain = () => (gainCalls++ % 2 === 0 ? gain : makeup);
      createBiquadFilter = () => biquad;
      createDynamicsCompressor = () => compressor;
      createAnalyser = () => analyser;
      setSinkId = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal('AudioContext', FakeContext);

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(fakeStream),
      },
    });

    await service.restart(null, null);
    expect(service.isRunning()).toBe(false);

    await service.start(
      { deviceId: 'mic-1' } as MediaDeviceInfo,
      { deviceId: 'spk-1' } as MediaDeviceInfo,
    );
    expect(service.isRunning()).toBe(true);

    await service.restart(
      { deviceId: 'mic-2' } as MediaDeviceInfo,
      { deviceId: 'spk-2' } as MediaDeviceInfo,
    );
    expect(service.isRunning()).toBe(true);

    await service.stop();
    expect(service.isRunning()).toBe(false);
  });

  it('stops on visibility change when document becomes hidden', async () => {
    service['_isRunning'].set(true);

    const stopSpy = vi.spyOn(service, 'stop').mockResolvedValue();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    service['onVisibilityChange']();

    expect(stopSpy).toHaveBeenCalled();
  });
});
