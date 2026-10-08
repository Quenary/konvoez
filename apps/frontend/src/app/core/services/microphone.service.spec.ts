import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_CAPTURE, VOICE_MAKEUP_GAIN } from '@core/audio/voice-dynamics';

const workletNodes = vi.hoisted(() => ({
  rnnoise: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
  speex: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.hoisted(() => {
  (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode =
    class AudioWorkletNode {};
});

vi.mock('@sapphi-red/web-noise-suppressor', () => ({
  SpeexWorkletNode: class SpeexWorkletNode {
    connect = vi.fn();
    disconnect = vi.fn();
    destroy = vi.fn();
    constructor() {
      workletNodes.speex.push(this);
    }
  },
  RnnoiseWorkletNode: class RnnoiseWorkletNode {
    connect = vi.fn();
    disconnect = vi.fn();
    destroy = vi.fn();
    constructor() {
      workletNodes.rnnoise.push(this);
    }
  },
  loadSpeex: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  loadRnnoise: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
}));

import { MicrophoneService } from './microphone.service';
import { loadRnnoise, loadSpeex } from '@sapphi-red/web-noise-suppressor';
import type { SpeexWorkletNode } from '@sapphi-red/web-noise-suppressor';

describe('MicrophoneService', () => {
  let service: MicrophoneService;
  let enumerateDevices: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    workletNodes.rnnoise.length = 0;
    workletNodes.speex.length = 0;
    vi.mocked(loadRnnoise).mockClear();
    vi.mocked(loadSpeex).mockClear();
    enumerateDevices = vi.fn().mockResolvedValue([]);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        enumerateDevices,
      },
    });

    TestBed.configureTestingModule({
      providers: [MicrophoneService],
    });

    service = TestBed.inject(MicrophoneService);
  });

  it('should release the microphone stream and clear the pipeline', async () => {
    const stop = vi.fn();
    const track = { id: 'track-1', readyState: 'live', stop };
    const stream = {
      getAudioTracks: () => [track],
    } as unknown as MediaStream;

    const sourceNode = { disconnect: vi.fn() };
    const gainNode = { disconnect: vi.fn() };
    const biquadNode = { disconnect: vi.fn() };
    const denoiserNode = { disconnect: vi.fn(), destroy: vi.fn() };
    const destinationNode = { disconnect: vi.fn() };
    const context = {
      state: 'running',
      close: vi.fn(),
      createMediaStreamSource: vi.fn(),
      createGain: vi.fn(() => gainNode),
      createBiquadFilter: vi.fn(() => biquadNode),
      createAnalyser: vi.fn(),
      createMediaStreamDestination: vi.fn(() => destinationNode),
      audioWorklet: { addModule: vi.fn() },
    };

    service['context'] = context as unknown as AudioContext;
    service['inputStream'] = stream;
    service['sourceNode'] = sourceNode as unknown as MediaStreamAudioSourceNode;
    service['gainNode'] = gainNode as unknown as GainNode;
    service['biquadNode'] = biquadNode as unknown as BiquadFilterNode;
    service['denoiserNode'] = denoiserNode as unknown as SpeexWorkletNode;
    service['destinationNode'] =
      destinationNode as unknown as MediaStreamAudioDestinationNode;
    service['_processedStream'].set(stream);

    await service.release();

    expect(stop).toHaveBeenCalled();
    expect(denoiserNode.destroy).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(service.processedStream()).toBeNull();
  });

  it('does not recreate capture after a spurious devicechange', async () => {
    const setDevice = vi.spyOn(service, 'setDevice').mockResolvedValue();
    service['_processedStream'].set({} as MediaStream);

    await service['handleDeviceChange']();

    expect(setDevice).not.toHaveBeenCalled();
  });

  it('falls back to the default input when the selected device disappears', async () => {
    const setDevice = vi.spyOn(service, 'setDevice').mockResolvedValue();
    service['device'] = {
      deviceId: 'missing',
      kind: 'audioinput',
    } as MediaDeviceInfo;
    service['_processedStream'].set({} as MediaStream);
    enumerateDevices.mockResolvedValue([]);

    await service['handleDeviceChange']();

    expect(setDevice).toHaveBeenCalledWith(null);
  });

  it('selects RNNoise at 48 kHz and Speex otherwise', async () => {
    const addModule = vi.fn().mockResolvedValue(undefined);
    service['context'] = {
      sampleRate: 48000,
      audioWorklet: { addModule },
    } as unknown as AudioContext;

    await service['resolveDenoiser']();

    expect(service['denoiserKind']).toBe('rnnoise');
    expect(loadRnnoise).toHaveBeenCalled();
    expect(addModule).toHaveBeenCalledWith(
      'assets/web-noise-suppressor/rnnoise/workletProcessor.js',
    );

    service['context'] = {
      sampleRate: 44100,
      audioWorklet: { addModule },
    } as unknown as AudioContext;
    service['denoiserKind'] = null;
    await service['resolveDenoiser']();

    expect(service['denoiserKind']).toBe('speex');
    expect(loadSpeex).toHaveBeenCalled();
  });

  it('falls back to Speex when RNNoise fails to load', async () => {
    vi.mocked(loadRnnoise).mockRejectedValueOnce(new Error('wasm'));
    const addModule = vi.fn().mockResolvedValue(undefined);
    service['context'] = {
      sampleRate: 48000,
      audioWorklet: { addModule },
    } as unknown as AudioContext;

    await service['resolveDenoiser']();

    expect(service['denoiserKind']).toBe('speex');
    expect(loadSpeex).toHaveBeenCalled();
  });

  it('connects expander, compressor, makeup and limiter after RNNoise', async () => {
    const dynamics: Array<{
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      port: { postMessage: ReturnType<typeof vi.fn> };
    }> = [];
    (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode = class {
      connect = vi.fn();
      disconnect = vi.fn();
      port = { postMessage: vi.fn() };
      constructor() {
        dynamics.push(this);
      }
    };

    const source = node('source');
    const gain = node('gain');
    const makeup = node('makeup');
    const biquad = node('biquad');
    const compressor = node('compressor');
    const analyser = node('analyser');
    const destination = node('destination');
    const gains = [gain, makeup];

    service['context'] = {
      createMediaStreamSource: () => source,
      createGain: () => gains.shift(),
      createBiquadFilter: () => biquad,
      createDynamicsCompressor: () => compressor,
      createAnalyser: () => analyser,
      createMediaStreamDestination: () => destination,
    } as unknown as AudioContext;
    service['inputStream'] = {} as MediaStream;
    service['denoiserKind'] = 'rnnoise';
    service['rnnoiseWasmBinary'] = new ArrayBuffer(8);
    service['dynamicsReady'] = true;

    await service['ensurePipeline']();

    const rnnoise = workletNodes.rnnoise[0];
    const expander = dynamics[0];
    const limiter = dynamics[1];
    expect(source.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(biquad);
    expect(biquad.connect).toHaveBeenCalledWith(rnnoise);
    expect(rnnoise.connect).toHaveBeenCalledWith(expander);
    expect(expander.connect).toHaveBeenCalledWith(compressor);
    expect(compressor.connect).toHaveBeenCalledWith(makeup);
    expect(makeup.connect).toHaveBeenCalledWith(limiter);
    expect(limiter.connect).toHaveBeenCalledWith(analyser);
    expect(limiter.connect).toHaveBeenCalledWith(destination);
    expect(biquad.frequency.value).toBe(VOICE_CAPTURE.highpassHz);
    expect(compressor.threshold.value).toBe(VOICE_CAPTURE.compressor.threshold);
    expect(compressor.ratio.value).toBe(VOICE_CAPTURE.compressor.ratio);
    expect(makeup.gain.value).toBe(VOICE_MAKEUP_GAIN);
    expect(service.processedStream()).toBe(destination.stream);

    service['cleanupPipeline']();
    expect(expander.port.postMessage).toHaveBeenCalledWith({ type: 'dispose' });
    expect(limiter.port.postMessage).toHaveBeenCalledWith({ type: 'dispose' });
    expect(expander.disconnect).toHaveBeenCalled();
    expect(limiter.disconnect).toHaveBeenCalled();
  });
});

function node(name: string) {
  return {
    name,
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 0 },
    frequency: { value: 0 },
    Q: { value: 0 },
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    fftSize: 0,
    smoothingTimeConstant: 0,
    type: '',
    stream: { name: `${name}-stream` },
  };
}
