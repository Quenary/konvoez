import { InjectionToken } from '@angular/core';
import {
  RnnoiseWorkletNode,
  loadRnnoise,
} from '@sapphi-red/web-noise-suppressor';
import { isSimdSupported } from './audio-capabilities';

export type DeepFilterOptions = {
  wasmModule: WebAssembly.Module;
  attenuationLimit?: number;
};

export class DeepFilterWorkletNode extends AudioWorkletNode {
  constructor(context: BaseAudioContext, options: DeepFilterOptions) {
    super(context, 'deepfilternet-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      processorOptions: {
        wasmModule: options.wasmModule,
        attenuationLimit: options.attenuationLimit ?? 100,
      },
    });
  }

  public destroy(): void {
    try {
      this.port.postMessage({ type: 'dispose' });
    } catch {
      // Port may already be closed or disconnected
    }
    this.disconnect();
  }
}

export async function loadDeepFilter({
  url,
}: {
  url: string;
}): Promise<WebAssembly.Module> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load DeepFilterNet wasm (${response.status})`);
  }
  const bytes = await response.arrayBuffer();
  return await WebAssembly.compile(bytes);
}

export type NoiseSuppressorPort = {
  loadRnnoise: typeof loadRnnoise;
  RnnoiseWorkletNode: typeof RnnoiseWorkletNode;
  loadDeepFilter: (options: { url: string }) => Promise<WebAssembly.Module>;
  DeepFilterWorkletNode: typeof DeepFilterWorkletNode;
  isSimdSupported: () => boolean;
};

export const NOISE_SUPPRESSOR_PORT = new InjectionToken<NoiseSuppressorPort>(
  'NOISE_SUPPRESSOR_PORT',
  {
    providedIn: 'root',
    factory: (): NoiseSuppressorPort => ({
      loadRnnoise,
      RnnoiseWorkletNode,
      loadDeepFilter,
      DeepFilterWorkletNode,
      isSimdSupported,
    }),
  },
);
