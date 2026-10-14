import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENoiseProcessor } from '../../app.enums';
import { APP_VERSION, DEEP_FILTER_VERSION } from '@core/asset-version';
import {
  type TCaptureGraph,
  type TCaptureWasmCache,
  buildCaptureGraph,
  createDenoiserNode,
  deepFilterWasmUrl,
  deepFilterWorkletUrl,
  disposeCaptureGraph,
  resolveDenoiser,
  swapDenoiser,
} from './capture-graph';
import type { NoiseSuppressorPort } from './noise-suppressor.port';

function createMockAudioNode(name: string) {
  return {
    name,
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
    frequency: { value: 0 },
    Q: { value: 0 },
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    port: { postMessage: vi.fn() },
  };
}

describe('capture-graph', () => {
  let mockPort: NoiseSuppressorPort;
  let cache: TCaptureWasmCache;
  let createdWorkletNodes: {
    rnnoise: Array<{
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    }>;
    deepfilter: Array<{
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      port: { postMessage: ReturnType<typeof vi.fn> };
    }>;
  };

  const previousWorkletNode = globalThis.AudioWorkletNode;

  beforeEach(() => {
    createdWorkletNodes = {
      rnnoise: [],
      deepfilter: [],
    };

    cache = {};

    mockPort = {
      loadRnnoise: vi.fn().mockResolvedValue(new ArrayBuffer(16)),
      loadDeepFilter: vi.fn().mockResolvedValue({} as WebAssembly.Module),
      isSimdSupported: vi.fn().mockReturnValue(true),
      RnnoiseWorkletNode: class RnnoiseWorkletNode {
        connect = vi.fn();
        disconnect = vi.fn();
        destroy = vi.fn();
        constructor() {
          createdWorkletNodes.rnnoise.push(this);
        }
      },
      DeepFilterWorkletNode: class DeepFilterWorkletNode {
        connect = vi.fn();
        disconnect = vi.fn();
        destroy = vi.fn();
        port = { postMessage: vi.fn() };
        constructor() {
          createdWorkletNodes.deepfilter.push(this);
        }
      },
    } as unknown as NoiseSuppressorPort;
  });

  describe('asset URLs', () => {
    it('cache-busts DeepFilterNet worklet with APP_VERSION and wasm with DEEP_FILTER_VERSION', () => {
      expect(deepFilterWorkletUrl).toBe(
        `assets/deepfilternet/worklet.js?v=${encodeURIComponent(APP_VERSION)}`,
      );
      expect(deepFilterWasmUrl).toBe(
        `assets/deepfilternet/df_bg.wasm?v=${encodeURIComponent(DEEP_FILTER_VERSION)}`,
      );
    });
  });

  describe('fallback chain (resolveDenoiser)', () => {
    it('returns pass-through processors directly without checks or loading', async () => {
      const ctx = { sampleRate: 48000 } as AudioContext;

      expect(
        await resolveDenoiser(ctx, ENoiseProcessor.BROWSER, mockPort, cache),
      ).toBe(ENoiseProcessor.BROWSER);
      expect(
        await resolveDenoiser(ctx, ENoiseProcessor.OFF, mockPort, cache),
      ).toBe(ENoiseProcessor.OFF);

      expect(mockPort.loadDeepFilter).not.toHaveBeenCalled();
      expect(mockPort.loadRnnoise).not.toHaveBeenCalled();
    });

    it('resolves DeepFilterNet when SIMD is supported and sampleRate is 48000', async () => {
      const addModule = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        sampleRate: 48000,
        audioWorklet: { addModule },
      } as unknown as AudioContext;

      const resolved = await resolveDenoiser(
        ctx,
        ENoiseProcessor.DEEPFILTER,
        mockPort,
        cache,
      );

      expect(resolved).toBe(ENoiseProcessor.DEEPFILTER);
      expect(mockPort.loadDeepFilter).toHaveBeenCalledTimes(1);
      expect(cache.dfModule).toBeDefined();
      expect(addModule).toHaveBeenCalledWith(
        expect.stringContaining('assets/deepfilternet/worklet.js'),
      );
    });

    it('falls back from DeepFilterNet to RNNoise when SIMD is unsupported', async () => {
      vi.mocked(mockPort.isSimdSupported).mockReturnValue(false);
      const addModule = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        sampleRate: 48000,
        audioWorklet: { addModule },
      } as unknown as AudioContext;

      const resolved = await resolveDenoiser(
        ctx,
        ENoiseProcessor.DEEPFILTER,
        mockPort,
        cache,
      );

      expect(resolved).toBe(ENoiseProcessor.RNNOISE);
      expect(mockPort.loadDeepFilter).not.toHaveBeenCalled();
      expect(mockPort.loadRnnoise).toHaveBeenCalledTimes(1);
      expect(cache.rnnoiseWasm).toBeDefined();
    });

    it('falls back from DeepFilterNet to RNNoise when DeepFilterNet fails to load', async () => {
      vi.mocked(mockPort.loadDeepFilter).mockRejectedValueOnce(
        new Error('Failed to load DeepFilterNet wasm'),
      );
      const addModule = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        sampleRate: 48000,
        audioWorklet: { addModule },
      } as unknown as AudioContext;

      const resolved = await resolveDenoiser(
        ctx,
        ENoiseProcessor.DEEPFILTER,
        mockPort,
        cache,
      );

      expect(resolved).toBe(ENoiseProcessor.RNNOISE);
      expect(mockPort.loadRnnoise).toHaveBeenCalledTimes(1);
    });

    it('falls back to OFF when RNNoise fails to load', async () => {
      vi.mocked(mockPort.loadRnnoise).mockRejectedValueOnce(
        new Error('RNNoise wasm network error'),
      );
      const addModule = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        sampleRate: 48000,
        audioWorklet: { addModule },
      } as unknown as AudioContext;

      const resolved = await resolveDenoiser(
        ctx,
        ENoiseProcessor.RNNOISE,
        mockPort,
        cache,
      );

      expect(resolved).toBe(ENoiseProcessor.OFF);
    });

    it('falls back to OFF when sample rate is not 48 kHz', async () => {
      const ctx = {
        sampleRate: 44100,
        audioWorklet: { addModule: vi.fn() },
      } as unknown as AudioContext;

      const resolved = await resolveDenoiser(
        ctx,
        ENoiseProcessor.DEEPFILTER,
        mockPort,
        cache,
      );

      expect(resolved).toBe(ENoiseProcessor.OFF);
      expect(mockPort.loadDeepFilter).not.toHaveBeenCalled();
      expect(mockPort.loadRnnoise).not.toHaveBeenCalled();
    });
  });

  describe('createDenoiserNode', () => {
    it('throws if cache is missing required binaries', () => {
      const ctx = {} as AudioContext;
      expect(() =>
        createDenoiserNode(ctx, ENoiseProcessor.DEEPFILTER, mockPort, {}),
      ).toThrow('missing DeepFilterNet module');
      expect(() =>
        createDenoiserNode(ctx, ENoiseProcessor.RNNOISE, mockPort, {}),
      ).toThrow('missing RNNoise wasm');
    });

    it('constructs DeepFilterWorkletNode and RnnoiseWorkletNode', () => {
      const ctx = {} as AudioContext;
      const loadedCache: TCaptureWasmCache = {
        dfModule: {} as WebAssembly.Module,
        rnnoiseWasm: new ArrayBuffer(8),
      };

      const dfNode = createDenoiserNode(
        ctx,
        ENoiseProcessor.DEEPFILTER,
        mockPort,
        loadedCache,
      );
      expect(dfNode).toBeInstanceOf(mockPort.DeepFilterWorkletNode);

      const rnNode = createDenoiserNode(
        ctx,
        ENoiseProcessor.RNNOISE,
        mockPort,
        loadedCache,
      );
      expect(rnNode).toBeInstanceOf(mockPort.RnnoiseWorkletNode);
    });
  });

  describe('buildCaptureGraph and chain order', () => {
    it('builds full chain with denoiser and dynamics', () => {
      const dynamicsNodes: Array<{
        connect: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
        port: { postMessage: ReturnType<typeof vi.fn> };
      }> = [];

      (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode = class {
        connect = vi.fn();
        disconnect = vi.fn();
        port = { postMessage: vi.fn() };
        constructor() {
          dynamicsNodes.push(this);
        }
      };

      const source = createMockAudioNode('source');
      const gain = createMockAudioNode('gain');
      const makeup = createMockAudioNode('makeup');
      const highpass = createMockAudioNode('highpass');
      const compressor = createMockAudioNode('compressor');

      let gainCount = 0;
      const ctx = {
        createMediaStreamSource: vi.fn(() => source),
        createGain: vi.fn(() => (gainCount++ === 0 ? gain : makeup)),
        createBiquadFilter: vi.fn(() => highpass),
        createDynamicsCompressor: vi.fn(() => compressor),
      } as unknown as AudioContext;

      cache.rnnoiseWasm = new ArrayBuffer(8);

      const graph = buildCaptureGraph(
        ctx,
        {} as MediaStream,
        {
          gain: 1.5,
          processor: ENoiseProcessor.RNNOISE,
          dynamicsReady: true,
        },
        mockPort,
        cache,
      );

      const denoiser = createdWorkletNodes.rnnoise[0];
      const expander = dynamicsNodes[0];
      const limiter = dynamicsNodes[1];

      expect(graph.source).toBe(source);
      expect(graph.gain).toBe(gain);
      expect(graph.highpass).toBe(highpass);
      expect(graph.denoiser).toBe(denoiser);
      expect(graph.expander).toBe(expander);
      expect(graph.compressor).toBe(compressor);
      expect(graph.makeup).toBe(makeup);
      expect(graph.limiter).toBe(limiter);
      expect(graph.tail).toBe(limiter);

      // Verify connection chain order: source -> gain -> highpass -> denoiser -> expander -> compressor -> makeup -> limiter
      expect(source.connect).toHaveBeenCalledWith(gain);
      expect(gain.connect).toHaveBeenCalledWith(highpass);
      expect(highpass.connect).toHaveBeenCalledWith(denoiser);
      expect(denoiser.connect).toHaveBeenCalledWith(expander);
      expect(expander.connect).toHaveBeenCalledWith(compressor);
      expect(compressor.connect).toHaveBeenCalledWith(makeup);
      expect(makeup.connect).toHaveBeenCalledWith(limiter);

      (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode =
        previousWorkletNode;
    });

    it('builds minimal chain without denoiser and without dynamics', () => {
      const source = createMockAudioNode('source');
      const gain = createMockAudioNode('gain');
      const highpass = createMockAudioNode('highpass');
      const compressor = createMockAudioNode('compressor');

      const ctx = {
        createMediaStreamSource: vi.fn(() => source),
        createGain: vi.fn(() => gain),
        createBiquadFilter: vi.fn(() => highpass),
        createDynamicsCompressor: vi.fn(() => compressor),
      } as unknown as AudioContext;

      const graph = buildCaptureGraph(
        ctx,
        {} as MediaStream,
        {
          gain: 1.0,
          processor: ENoiseProcessor.OFF,
          dynamicsReady: false,
        },
        mockPort,
        cache,
      );

      expect(graph.denoiser).toBeNull();
      expect(graph.expander).toBeNull();
      expect(graph.makeup).toBeNull();
      expect(graph.limiter).toBeNull();
      expect(graph.tail).toBe(compressor);

      // Chain: source -> gain -> highpass -> compressor
      expect(source.connect).toHaveBeenCalledWith(gain);
      expect(gain.connect).toHaveBeenCalledWith(highpass);
      expect(highpass.connect).toHaveBeenCalledWith(compressor);
    });
  });

  describe('swapDenoiser', () => {
    it('keeps the tail, destroys the old node, and reconnects properly', async () => {
      const dynamicsNodes: Array<{
        connect: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
        port: { postMessage: ReturnType<typeof vi.fn> };
      }> = [];

      (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode = class {
        connect = vi.fn();
        disconnect = vi.fn();
        port = { postMessage: vi.fn() };
        constructor() {
          dynamicsNodes.push(this);
        }
      };

      const source = createMockAudioNode('source');
      const gain = createMockAudioNode('gain');
      const highpass = createMockAudioNode('highpass');
      const makeup = createMockAudioNode('makeup');
      const compressor = createMockAudioNode('compressor');

      let gainCount = 0;
      const ctx = {
        sampleRate: 48000,
        audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
        createMediaStreamSource: vi.fn(() => source),
        createGain: vi.fn(() => (gainCount++ === 0 ? gain : makeup)),
        createBiquadFilter: vi.fn(() => highpass),
        createDynamicsCompressor: vi.fn(() => compressor),
      } as unknown as AudioContext;

      cache.rnnoiseWasm = new ArrayBuffer(8);
      cache.dfModule = {} as WebAssembly.Module;

      const graph: TCaptureGraph = buildCaptureGraph(
        ctx,
        {} as MediaStream,
        {
          gain: 1.0,
          processor: ENoiseProcessor.RNNOISE,
          dynamicsReady: true,
        },
        mockPort,
        cache,
      );

      expect(graph.denoiser).toBeDefined();
      expect(graph.expander).toBeDefined();
      const initialDenoiser = graph.denoiser;
      const initialTail = graph.tail;
      const expander = graph.expander;
      if (!initialDenoiser || !expander) {
        throw new Error('Initial nodes not created');
      }

      // Swap to DEEPFILTER
      const newProcessor = await swapDenoiser(
        graph,
        ctx,
        ENoiseProcessor.DEEPFILTER,
        mockPort,
        cache,
      );

      expect(newProcessor).toBe(ENoiseProcessor.DEEPFILTER);
      expect(initialDenoiser.disconnect).toHaveBeenCalled();
      expect(initialDenoiser.destroy).toHaveBeenCalled();
      expect(graph.denoiser).not.toBe(initialDenoiser);
      expect(graph.tail).toBe(initialTail);
      expect(highpass.disconnect).toHaveBeenCalled();
      expect(highpass.connect).toHaveBeenCalledWith(graph.denoiser);
      expect(graph.denoiser?.connect).toHaveBeenCalledWith(expander);

      // Swap to OFF
      const offProcessor = await swapDenoiser(
        graph,
        ctx,
        ENoiseProcessor.OFF,
        mockPort,
        cache,
      );

      expect(offProcessor).toBe(ENoiseProcessor.OFF);
      expect(graph.denoiser).toBeNull();
      expect(graph.tail).toBe(initialTail);
      expect(highpass.connect).toHaveBeenCalledWith(expander);

      (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode =
        previousWorkletNode;
    });
  });

  describe('disposeCaptureGraph', () => {
    it('disconnects all nodes and disposes denoiser and dynamics worklets', () => {
      const source = createMockAudioNode('source');
      const gain = createMockAudioNode('gain');
      const highpass = createMockAudioNode('highpass');
      const denoiser = {
        disconnect: vi.fn(),
        destroy: vi.fn(),
      } as unknown as TCaptureGraph['denoiser'];
      const expander = createMockAudioNode(
        'expander',
      ) as unknown as AudioWorkletNode;
      const compressor = createMockAudioNode('compressor');
      const makeup = createMockAudioNode('makeup');
      const limiter = createMockAudioNode(
        'limiter',
      ) as unknown as AudioWorkletNode;

      const graph: TCaptureGraph = {
        source: source as unknown as MediaStreamAudioSourceNode,
        gain: gain as unknown as GainNode,
        highpass: highpass as unknown as BiquadFilterNode,
        denoiser,
        expander,
        compressor: compressor as unknown as DynamicsCompressorNode,
        makeup: makeup as unknown as GainNode,
        limiter,
        tail: limiter as unknown as AudioNode,
      };

      disposeCaptureGraph(graph);

      expect(source.disconnect).toHaveBeenCalled();
      expect(gain.disconnect).toHaveBeenCalled();
      expect(highpass.disconnect).toHaveBeenCalled();
      expect(denoiser?.disconnect).toHaveBeenCalled();
      expect(denoiser?.destroy).toHaveBeenCalled();
      expect(expander.port.postMessage).toHaveBeenCalledWith({
        type: 'dispose',
      });
      expect(expander.disconnect).toHaveBeenCalled();
      expect(compressor.disconnect).toHaveBeenCalled();
      expect(makeup.disconnect).toHaveBeenCalled();
      expect(limiter.port.postMessage).toHaveBeenCalledWith({
        type: 'dispose',
      });
      expect(limiter.disconnect).toHaveBeenCalled();
    });

    it('handles null graph gracefully without error', () => {
      expect(() => disposeCaptureGraph(null)).not.toThrow();
    });
  });
});
