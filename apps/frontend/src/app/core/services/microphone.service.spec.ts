import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOISE_SUPPRESSOR_PORT,
  type NoiseSuppressorPort,
} from '@core/audio/noise-suppressor.port';
import type { TCaptureGraph } from '@core/audio/capture-graph';
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

    const source = node('source');
    const gain = node('gain');
    const highpass = node('highpass');
    const denoiser = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      destroy: vi.fn(),
    };
    const compressor = node('compressor');
    const destination = node('destination');

    const graph: TCaptureGraph = {
      source: source as unknown as MediaStreamAudioSourceNode,
      gain: gain as unknown as GainNode,
      highpass: highpass as unknown as BiquadFilterNode,
      denoiser: denoiser as unknown as TCaptureGraph['denoiser'],
      expander: null,
      compressor: compressor as unknown as DynamicsCompressorNode,
      makeup: null,
      limiter: null,
      tail: compressor as unknown as AudioNode,
    };

    const context = {
      state: 'running',
      close: vi.fn(),
    };

    service['context'] = context as unknown as AudioContext;
    service['inputStream'] = stream;
    service['captureGraph'] = graph;
    service['destinationNode'] =
      destination as unknown as MediaStreamAudioDestinationNode;
    service['_processedStream'].set(stream);

    await service.release();

    expect(stop).toHaveBeenCalled();
    expect(denoiser.destroy).toHaveBeenCalled();
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

  it('switches processor at runtime preserving MediaStreamDestination track', async () => {
    const destinationStream = { id: 'dest-stream' } as unknown as MediaStream;
    service['_processedStream'].set(destinationStream);

    const source = node('source');
    const gain = node('gain');
    const highpass = node('highpass');
    const compressor = node('compressor');

    const graph: TCaptureGraph = {
      source: source as unknown as MediaStreamAudioSourceNode,
      gain: gain as unknown as GainNode,
      highpass: highpass as unknown as BiquadFilterNode,
      denoiser: null,
      expander: null,
      compressor: compressor as unknown as DynamicsCompressorNode,
      makeup: null,
      limiter: null,
      tail: compressor as unknown as AudioNode,
    };

    service['context'] = {
      sampleRate: 48000,
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    } as unknown as AudioContext;
    service['captureGraph'] = graph;
    service['activeProcessor'] = ENoiseProcessor.RNNOISE;
    service['wasmCache'].rnnoiseWasm = new ArrayBuffer(8);

    await service.setProcessor(ENoiseProcessor.OFF);

    expect(service.processedStream()).toBe(destinationStream);
    expect(service['activeProcessor']).toBe(ENoiseProcessor.OFF);
    expect(highpass.connect).toHaveBeenCalledWith(compressor);
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
    const triggerCallback = updateCallback as unknown as (ev: {
      averageLoad: number;
    }) => void;

    triggerCallback({ averageLoad: 0.9 });
    triggerCallback({ averageLoad: 0.9 });
    triggerCallback({ averageLoad: 0.9 });
    expect(overloadSpy).not.toHaveBeenCalled();

    triggerCallback({ averageLoad: 0.9 });
    expect(overloadSpy).toHaveBeenCalledTimes(1);

    triggerCallback({ averageLoad: 0.9 });
    expect(overloadSpy).toHaveBeenCalledTimes(1);
  });

  it('connects captureGraph tail to analyser and MediaStreamDestination in ensurePipeline', () => {
    const source = node('source');
    const gain = node('gain');
    const highpass = node('highpass');
    const compressor = node('compressor');
    const analyser = node('analyser');
    const destination = node('destination');

    service['context'] = {
      createMediaStreamSource: () => source,
      createGain: () => gain,
      createBiquadFilter: () => highpass,
      createDynamicsCompressor: () => compressor,
      createAnalyser: () => analyser,
      createMediaStreamDestination: () => destination,
    } as unknown as AudioContext;
    service['inputStream'] = {} as MediaStream;
    service['activeProcessor'] = ENoiseProcessor.OFF;
    service['dynamicsReady'] = false;

    service['ensurePipeline']();

    expect(compressor.connect).toHaveBeenCalledWith(analyser);
    expect(compressor.connect).toHaveBeenCalledWith(destination);
    expect(service.processedStream()).toBe(destination.stream);
    expect(service.analyserNode()).toBe(analyser);
  });

  it('drops nodes built before ensurePipeline throws', () => {
    service['context'] = {
      createMediaStreamSource: () => {
        throw new Error('source failed');
      },
    } as unknown as AudioContext;
    service['inputStream'] = {} as MediaStream;

    expect(() => service['ensurePipeline']()).toThrow('source failed');
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
