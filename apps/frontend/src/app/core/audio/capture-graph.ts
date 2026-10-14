import {
  APP_VERSION,
  DEEP_FILTER_VERSION,
  NOISE_SUPPRESSOR_VERSION,
  withVersion,
} from '@core/asset-version';
import type { NoiseSuppressorPort } from './noise-suppressor.port';
import {
  VOICE_CAPTURE,
  VOICE_MAKEUP_GAIN,
  createVoiceDynamicsNode,
  disposeVoiceDynamicsNode,
} from './voice-dynamics';
import { ensureWorkletModule } from './ensure-worklet-module';
import { ENoiseProcessor } from '../../app.enums';

// The DeepFilterNet worklet is vendored and patched with a custom dispose protocol,
// so its cache-buster follows the app version rather than the upstream package version.
export const deepFilterWorkletUrl = withVersion(
  'assets/deepfilternet/worklet.js',
  APP_VERSION,
);
export const deepFilterWasmUrl = withVersion(
  'assets/deepfilternet/df_bg.wasm',
  DEEP_FILTER_VERSION,
);
export const rnnoiseWorkletUrl = withVersion(
  'assets/web-noise-suppressor/rnnoise/workletProcessor.js',
  NOISE_SUPPRESSOR_VERSION,
);
export const rnnoiseWasmUrl = withVersion(
  'assets/web-noise-suppressor/rnnoise.wasm',
  NOISE_SUPPRESSOR_VERSION,
);
export const rnnoiseSimdWasmUrl = withVersion(
  'assets/web-noise-suppressor/rnnoise_simd.wasm',
  NOISE_SUPPRESSOR_VERSION,
);

export type TDenoiserNode =
  | InstanceType<NoiseSuppressorPort['RnnoiseWorkletNode']>
  | InstanceType<NoiseSuppressorPort['DeepFilterWorkletNode']>;

export interface TCaptureWasmCache {
  dfModule?: WebAssembly.Module | null;
  rnnoiseWasm?: ArrayBuffer | null;
}

export interface TCaptureGraph {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  highpass: BiquadFilterNode;
  denoiser: TDenoiserNode | null;
  expander: AudioWorkletNode | null;
  compressor: DynamicsCompressorNode;
  makeup: GainNode | null;
  limiter: AudioWorkletNode | null;
  tail: AudioNode;
}

export interface TBuildCaptureGraphOptions {
  gain: number;
  processor: ENoiseProcessor;
  dynamicsReady: boolean;
}

export async function resolveDenoiser(
  ctx: AudioContext | null | undefined,
  preferred: ENoiseProcessor,
  port: NoiseSuppressorPort,
  cache: TCaptureWasmCache,
): Promise<ENoiseProcessor> {
  if (
    preferred === ENoiseProcessor.BROWSER ||
    preferred === ENoiseProcessor.OFF
  ) {
    return preferred;
  }

  if (preferred === ENoiseProcessor.DEEPFILTER) {
    const isSimd = port.isSimdSupported();
    const is48k = ctx?.sampleRate === 48000;
    if (isSimd && is48k && ctx) {
      try {
        if (!cache.dfModule) {
          cache.dfModule = await port.loadDeepFilter({
            url: deepFilterWasmUrl,
          });
        }
        await ensureWorkletModule(ctx, deepFilterWorkletUrl);
        return ENoiseProcessor.DEEPFILTER;
      } catch (error) {
        console.warn(
          'DeepFilterNet load failed, falling back to RNNoise',
          error,
        );
      }
    } else {
      console.warn(
        `DeepFilterNet unsupported (SIMD: ${isSimd}, sampleRate: ${ctx?.sampleRate}); falling back to RNNoise`,
      );
    }
  }

  if (ctx && ctx.sampleRate === 48000) {
    try {
      if (!cache.rnnoiseWasm) {
        cache.rnnoiseWasm = await port.loadRnnoise({
          url: rnnoiseWasmUrl,
          simdUrl: rnnoiseSimdWasmUrl,
        });
      }
      await ensureWorkletModule(ctx, rnnoiseWorkletUrl);
      return ENoiseProcessor.RNNOISE;
    } catch (error) {
      console.warn('RNNoise load failed, falling back to off', error);
    }
  } else {
    console.warn('RNNoise requires 48 kHz, falling back to off');
  }

  return ENoiseProcessor.OFF;
}

export function createDenoiserNode(
  ctx: AudioContext,
  kind: ENoiseProcessor,
  port: NoiseSuppressorPort,
  cache: TCaptureWasmCache,
): TDenoiserNode {
  if (kind === ENoiseProcessor.DEEPFILTER) {
    if (!cache.dfModule) {
      throw new Error('createDenoiserNode(): missing DeepFilterNet module');
    }
    return new port.DeepFilterWorkletNode(ctx, {
      wasmModule: cache.dfModule,
    });
  }
  if (kind === ENoiseProcessor.RNNOISE) {
    if (!cache.rnnoiseWasm) {
      throw new Error('createDenoiserNode(): missing RNNoise wasm');
    }
    return new port.RnnoiseWorkletNode(ctx, {
      wasmBinary: cache.rnnoiseWasm,
      maxChannels: 1,
    });
  }
  throw new Error(`createDenoiserNode(): unsupported processor ${kind}`);
}

export function buildCaptureGraph(
  ctx: AudioContext,
  stream: MediaStream,
  options: TBuildCaptureGraphOptions,
  port: NoiseSuppressorPort,
  cache: TCaptureWasmCache,
): TCaptureGraph {
  const source = ctx.createMediaStreamSource(stream);

  const gain = ctx.createGain();
  gain.gain.value = options.gain;

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = VOICE_CAPTURE.highpassHz;
  highpass.Q.value = VOICE_CAPTURE.highpassQ;

  let denoiser: TDenoiserNode | null = null;
  if (
    options.processor === ENoiseProcessor.DEEPFILTER ||
    options.processor === ENoiseProcessor.RNNOISE
  ) {
    try {
      denoiser = createDenoiserNode(ctx, options.processor, port, cache);
    } catch (error) {
      console.warn('Failed to construct denoiser node', error);
      denoiser = null;
    }
  }

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = VOICE_CAPTURE.compressor.threshold;
  compressor.knee.value = VOICE_CAPTURE.compressor.knee;
  compressor.ratio.value = VOICE_CAPTURE.compressor.ratio;
  compressor.attack.value = VOICE_CAPTURE.compressor.attack;
  compressor.release.value = VOICE_CAPTURE.compressor.release;

  let expander: AudioWorkletNode | null = null;
  let limiter: AudioWorkletNode | null = null;
  let makeup: GainNode | null = null;

  if (options.dynamicsReady) {
    try {
      expander = createVoiceDynamicsNode(ctx, 'expander');
      limiter = createVoiceDynamicsNode(ctx, 'limiter');
      makeup = ctx.createGain();
      makeup.gain.value = VOICE_MAKEUP_GAIN;
    } catch (error) {
      console.warn('Voice dynamics nodes unavailable', error);
      if (expander) {
        disposeVoiceDynamicsNode(expander);
      }
      if (limiter) {
        disposeVoiceDynamicsNode(limiter);
      }
      expander = null;
      limiter = null;
      makeup = null;
    }
  }

  const chain: AudioNode[] = [source, gain, highpass];
  if (denoiser) {
    chain.push(denoiser);
  }
  if (expander) {
    chain.push(expander);
  }
  chain.push(compressor);
  if (makeup) {
    chain.push(makeup);
  }
  if (limiter) {
    chain.push(limiter);
  }

  for (let i = 0; i < chain.length - 1; i++) {
    chain[i].connect(chain[i + 1]);
  }

  const tail = chain[chain.length - 1];

  return {
    source,
    gain,
    highpass,
    denoiser,
    expander,
    compressor,
    makeup,
    limiter,
    tail,
  };
}

export async function swapDenoiser(
  graph: TCaptureGraph,
  ctx: AudioContext,
  kind: ENoiseProcessor,
  port: NoiseSuppressorPort,
  cache: TCaptureWasmCache,
): Promise<ENoiseProcessor> {
  let resolved = await resolveDenoiser(ctx, kind, port, cache);

  const nextNode: AudioNode = graph.expander ?? graph.compressor;

  graph.highpass.disconnect();
  if (graph.denoiser) {
    graph.denoiser.disconnect();
    graph.denoiser.destroy();
    graph.denoiser = null;
  }

  if (
    resolved === ENoiseProcessor.DEEPFILTER ||
    resolved === ENoiseProcessor.RNNOISE
  ) {
    try {
      graph.denoiser = createDenoiserNode(ctx, resolved, port, cache);
      graph.highpass.connect(graph.denoiser);
      graph.denoiser.connect(nextNode);
    } catch (error) {
      console.warn(
        'Failed to construct denoiser node during swapDenoiser',
        error,
      );
      graph.denoiser = null;
      resolved = ENoiseProcessor.OFF;
      graph.highpass.connect(nextNode);
    }
  } else {
    graph.highpass.connect(nextNode);
  }

  return resolved;
}

export function disposeCaptureGraph(graph: TCaptureGraph | null): void {
  if (!graph) {
    return;
  }
  try {
    graph.source.disconnect();
    graph.gain.disconnect();
    graph.highpass.disconnect();
    if (graph.denoiser) {
      graph.denoiser.disconnect();
      graph.denoiser.destroy();
      graph.denoiser = null;
    }
    if (graph.expander) {
      disposeVoiceDynamicsNode(graph.expander);
      graph.expander = null;
    }
    graph.compressor.disconnect();
    if (graph.makeup) {
      graph.makeup.disconnect();
      graph.makeup = null;
    }
    if (graph.limiter) {
      disposeVoiceDynamicsNode(graph.limiter);
      graph.limiter = null;
    }
  } catch (error) {
    console.warn('disposeCaptureGraph error', error);
  }
}
