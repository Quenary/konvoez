import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEEP_FILTER_VERSION,
  NOISE_SUPPRESSOR_VERSION,
} from '@core/asset-version';
import { VOICE_CAPTURE, VOICE_MAKEUP_GAIN } from '@core/audio/voice-dynamics';
import {
  NOISE_SUPPRESSOR_PORT,
  type NoiseSuppressorPort,
} from '@core/audio/noise-suppressor.port';
import { TuiNotificationService } from '@taiga-ui/core';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ENoiseProcessor } from '../../app.enums';
import { MicrophoneService } from './microphone.service';

describe('MicrophoneService', () => {
  let service: MicrophoneService;
  let enumerateDevices: ReturnType<typeof vi.fn>;
  let loadRnnoise: ReturnType<typeof vi.fn>;
  let loadDeepFilter: ReturnType<typeof vi.fn>;
  let isSimdSupported: ReturnType<typeof vi.fn>;
  let notificationOpen: ReturnType<typeof vi.fn>;

  const workletNodes = {
    rnnoise: [] as Array<{
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    }>,
    deepfilter: [] as Array<{
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      port: {
        postMessage: ReturnType<typeof vi.fn>;
        onmessage?: ((event: MessageEvent) => void) | null;
      };
    }>,
  };

  const noiseSuppressorPort = {
    loadRnnoise: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    loadDeepFilter: vi.fn().mockResolvedValue({} as WebAssembly.Module),
    isSimdSupported: vi.fn().mockReturnValue(true),
    RnnoiseWorkletNode: class RnnoiseWorkletNode {
      connect = vi.fn();
      disconnect = vi.fn();
      destroy = vi.fn();
      constructor() {
        workletNodes.rnnoise.push(this);
      }
    },
    DeepFilterWorkletNode: class DeepFilterWorkletNode {
      connect = vi.fn();
      disconnect = vi.fn();
      destroy = vi.fn();
      port = {
        postMessage: vi.fn(),
        onmessage: null,
      };
      constructor() {
        workletNodes.deepfilter.push(this);
      }
    },
  } as unknown as NoiseSuppressorPort;

  beforeEach(() => {
    workletNodes.rnnoise.length = 0;
    workletNodes.deepfilter.length = 0;
    loadRnnoise = vi.mocked(noiseSuppressorPort.loadRnnoise);
    loadDeepFilter = vi.mocked(noiseSuppressorPort.loadDeepFilter);
    isSimdSupported = vi.mocked(noiseSuppressorPort.isSimdSupported);

    loadRnnoise.mockReset();
    loadRnnoise.mockResolvedValue(new ArrayBuffer(8));
    loadDeepFilter.mockReset();
    loadDeepFilter.mockResolvedValue({} as WebAssembly.Module);
    isSimdSupported.mockReset();
    isSimdSupported.mockReturnValue(true);

    notificationOpen = vi.fn().mockReturnValue(of(null));
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
      providers: [
        MicrophoneService,
        { provide: NOISE_SUPPRESSOR_PORT, useValue: noiseSuppressorPort },
        {
          provide: TuiNotificationService,
          useValue: { open: notificationOpen },
        },
        {
          provide: TranslateService,
          useValue: { instant: (key: string) => key },
        },
      ],
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
    service['denoiserNode'] = denoiserNode as unknown as InstanceType<
      NoiseSuppressorPort['DeepFilterWorkletNode']
    >;
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

  it('selects DeepFilterNet at 48 kHz when SIMD is supported', async () => {
    const addModule = vi.fn().mockResolvedValue(undefined);
    service['context'] = {
      sampleRate: 48000,
      audioWorklet: { addModule },
    } as unknown as AudioContext;

    const resolved = await service['resolveDenoiserKind'](
      ENoiseProcessor.DEEPFILTER,
    );

    expect(resolved).toBe(ENoiseProcessor.DEEPFILTER);
    expect(loadDeepFilter).toHaveBeenCalled();
    expect(addModule).toHaveBeenCalledWith(
      `assets/deepfilternet/worklet.js?v=${DEEP_FILTER_VERSION}`,
    );
  });

  it('falls back to RNNoise when SIMD is unsupported', async () => {
    isSimdSupported.mockReturnValue(false);
    const addModule = vi.fn().mockResolvedValue(undefined);
    service['context'] = {
      sampleRate: 48000,
      audioWorklet: { addModule },
    } as unknown as AudioContext;

    const resolved = await service['resolveDenoiserKind'](
      ENoiseProcessor.DEEPFILTER,
    );

    expect(resolved).toBe(ENoiseProcessor.RNNOISE);
    expect(loadRnnoise).toHaveBeenCalled();
    expect(addModule).toHaveBeenCalledWith(
      `assets/web-noise-suppressor/rnnoise/workletProcessor.js?v=${NOISE_SUPPRESSOR_VERSION}`,
    );
  });

  it('falls back to RNNoise when DeepFilterNet fails to load', async () => {
    loadDeepFilter.mockRejectedValueOnce(new Error('deepfilter wasm failed'));
    const addModule = vi.fn().mockResolvedValue(undefined);
    service['context'] = {
      sampleRate: 48000,
      audioWorklet: { addModule },
    } as unknown as AudioContext;

    const resolved = await service['resolveDenoiserKind'](
      ENoiseProcessor.DEEPFILTER,
    );

    expect(resolved).toBe(ENoiseProcessor.RNNOISE);
    expect(loadRnnoise).toHaveBeenCalled();
  });

  it('falls back to off when both DeepFilterNet and RNNoise fail to load', async () => {
    loadDeepFilter.mockRejectedValueOnce(new Error('deepfilter failed'));
    loadRnnoise.mockRejectedValueOnce(new Error('rnnoise failed'));
    service['context'] = {
      sampleRate: 48000,
      audioWorklet: { addModule: vi.fn() },
    } as unknown as AudioContext;

    const resolved = await service['resolveDenoiserKind'](
      ENoiseProcessor.DEEPFILTER,
    );

    expect(resolved).toBe(ENoiseProcessor.OFF);
  });

  it('switches processor at runtime preserving MediaStreamDestination track', async () => {
    const destinationStream = { id: 'dest-stream' } as unknown as MediaStream;
    service['_processedStream'].set(destinationStream);

    const biquad = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as BiquadFilterNode;
    const compressor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as DynamicsCompressorNode;

    service['context'] = {
      sampleRate: 48000,
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    } as unknown as AudioContext;
    service['biquadNode'] = biquad;
    service['compressorNode'] = compressor;
    service['activeProcessor'] = ENoiseProcessor.RNNOISE;
    service['rnnoiseWasmBinary'] = new ArrayBuffer(8);

    await service.setProcessor(ENoiseProcessor.OFF);

    expect(service.processedStream()).toBe(destinationStream);
    expect(service['activeProcessor']).toBe(ENoiseProcessor.OFF);
    expect(biquad.connect).toHaveBeenCalledWith(compressor);
  });

  it('handles CPU overload fallback with notification', async () => {
    service['activeProcessor'] = ENoiseProcessor.DEEPFILTER;
    service['processorPreference'] = ENoiseProcessor.DEEPFILTER;

    const applyProcessorSpy = vi
      .spyOn(
        service as unknown as {
          applyProcessor: (p: ENoiseProcessor) => Promise<void>;
        },
        'applyProcessor',
      )
      .mockResolvedValue();

    await service['handleCpuOverload']();

    expect(applyProcessorSpy).toHaveBeenCalledWith(ENoiseProcessor.RNNOISE);
    expect(notificationOpen).toHaveBeenCalledTimes(1);
    expect(service['processorPreference']).toBe(ENoiseProcessor.DEEPFILTER);
  });

  it('triggers CPU overload fallback when renderCapacity reports sustained high load', () => {
    service['activeProcessor'] = ENoiseProcessor.DEEPFILTER;
    const overloadSpy = vi
      .spyOn(
        service as unknown as { handleCpuOverload: () => Promise<void> },
        'handleCpuOverload',
      )
      .mockResolvedValue();

    let updateCallback: ((ev: { averageLoad: number }) => void) | null = null;
    service['context'] = {
      renderCapacity: {
        start: vi.fn(),
        addEventListener: vi.fn(
          (_type: string, cb: (ev: { averageLoad: number }) => void) => {
            updateCallback = cb;
          },
        ),
      },
    } as unknown as AudioContext;

    service['setupRenderCapacityListener']();
    expect(updateCallback).toBeTruthy();

    updateCallback!({ averageLoad: 0.9 });
    updateCallback!({ averageLoad: 0.9 });
    updateCallback!({ averageLoad: 0.9 });
    expect(overloadSpy).not.toHaveBeenCalled();

    updateCallback!({ averageLoad: 0.9 });
    expect(overloadSpy).toHaveBeenCalledTimes(1);
  });

  it('connects expander, compressor, makeup and limiter after RNNoise', async () => {
    const dynamics: Array<{
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      port: { postMessage: ReturnType<typeof vi.fn> };
    }> = [];
    const previousWorkletNode = globalThis.AudioWorkletNode;
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

    let gainCalls = 0;
    service['context'] = {
      createMediaStreamSource: () => source,
      createGain: () => (gainCalls++ === 0 ? gain : makeup),
      createBiquadFilter: () => biquad,
      createDynamicsCompressor: () => compressor,
      createAnalyser: () => analyser,
      createMediaStreamDestination: () => destination,
    } as unknown as AudioContext;
    service['inputStream'] = {} as MediaStream;
    service['activeProcessor'] = ENoiseProcessor.RNNOISE;
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

    (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode =
      previousWorkletNode;
  });

  it('omits expander, makeup and limiter when dynamics are not ready', async () => {
    const source = node('source');
    const gain = node('gain');
    const biquad = node('biquad');
    const compressor = node('compressor');
    const analyser = node('analyser');
    const destination = node('destination');

    let gainCalls = 0;
    service['context'] = {
      createMediaStreamSource: () => source,
      createGain: () => {
        gainCalls++;
        return gain;
      },
      createBiquadFilter: () => biquad,
      createDynamicsCompressor: () => compressor,
      createAnalyser: () => analyser,
      createMediaStreamDestination: () => destination,
    } as unknown as AudioContext;
    service['inputStream'] = {} as MediaStream;
    service['activeProcessor'] = ENoiseProcessor.RNNOISE;
    service['rnnoiseWasmBinary'] = new ArrayBuffer(8);
    service['dynamicsReady'] = false;

    await service['ensurePipeline']();

    const rnnoise = workletNodes.rnnoise[0];
    expect(source.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(biquad);
    expect(biquad.connect).toHaveBeenCalledWith(rnnoise);
    expect(rnnoise.connect).toHaveBeenCalledWith(compressor);
    expect(compressor.connect).toHaveBeenCalledWith(analyser);
    expect(compressor.connect).toHaveBeenCalledWith(destination);
    expect(gainCalls).toBe(1);
    expect(service['makeupNode']).toBeNull();
    expect(service['expanderNode']).toBeNull();
    expect(service['limiterNode']).toBeNull();
  });

  it('drops nodes built before ensurePipeline throws', async () => {
    const source = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    service['context'] = {
      createMediaStreamSource: () => source,
      createGain: () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 0 },
      }),
      createBiquadFilter: () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        frequency: { value: 0 },
        Q: { value: 0 },
        type: '',
      }),
      createDynamicsCompressor: () => {
        throw new Error('compressor failed');
      },
    } as unknown as AudioContext;
    service['inputStream'] = {} as MediaStream;
    service['activeProcessor'] = ENoiseProcessor.RNNOISE;
    service['rnnoiseWasmBinary'] = new ArrayBuffer(8);
    service['dynamicsReady'] = false;

    await expect(service['ensurePipeline']()).rejects.toThrow(
      'compressor failed',
    );
    expect(source.disconnect).toHaveBeenCalled();
    expect(workletNodes.rnnoise[0]?.destroy).toHaveBeenCalled();
    expect(service.processedStream()).toBeNull();
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
