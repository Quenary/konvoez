import { APP_VERSION, withVersion } from '@core/asset-version';

/** Classic worklet script served from `public/`. Version query busts the immutable nginx cache. */
export const VOICE_DYNAMICS_WORKLET_URL = withVersion(
  'audio/voice-dynamics.worklet.js',
  APP_VERSION,
);

export const VOICE_DYNAMICS_PROCESSOR = 'konvoez/voice-dynamics';

export const VOICE_CAPTURE = {
  highpassHz: 100,
  highpassQ: 0.7,
  compressor: {
    threshold: -26,
    knee: 16,
    ratio: 2.5,
    attack: 0.012,
    release: 0.25,
  },
  makeupDb: 5,
} as const;

/** About +5 dB. Quiet speech below the compressor threshold comes up by this much. */
export const VOICE_MAKEUP_GAIN = 10 ** (VOICE_CAPTURE.makeupDb / 20);

export const VOICE_EXPANDER_OPTIONS = {
  expander: true,
  limiter: false,
  openMarginDb: 14,
  closeMarginDb: 8,
  holdMs: 150,
  attackMs: 5,
  releaseMs: 120,
  maxReductionDb: 40,
  expanderLookaheadSamples: 240,
} as const;

export const VOICE_LIMITER_OPTIONS = {
  expander: false,
  limiter: true,
  ceilingDb: -1,
  lookaheadSamples: 128,
  limiterReleaseMs: 50,
} as const;

const workletLoads = new WeakMap<BaseAudioContext, Promise<void>>();

export function ensureVoiceDynamicsWorklet(
  context: BaseAudioContext,
): Promise<void> {
  const pending = workletLoads.get(context);
  if (pending) {
    return pending;
  }
  const loading = context.audioWorklet
    .addModule(VOICE_DYNAMICS_WORKLET_URL)
    .catch((error: unknown) => {
      workletLoads.delete(context);
      throw error;
    });
  workletLoads.set(context, loading);
  return loading;
}

export function createVoiceDynamicsNode(
  context: BaseAudioContext,
  mode: 'expander' | 'limiter',
): AudioWorkletNode {
  return new AudioWorkletNode(context, VOICE_DYNAMICS_PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions:
      mode === 'expander' ? VOICE_EXPANDER_OPTIONS : VOICE_LIMITER_OPTIONS,
  });
}

/** Ask the processor to stop. Disconnect alone leaves process() running. */
export function disposeVoiceDynamicsNode(node: AudioWorkletNode): void {
  try {
    node.port.postMessage({ type: 'dispose' });
  } catch (error) {
    console.warn('Voice dynamics dispose failed', error);
  }
  node.disconnect();
}
