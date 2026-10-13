import { InjectionToken } from '@angular/core';
import {
  RnnoiseWorkletNode,
  loadRnnoise,
} from '@sapphi-red/web-noise-suppressor';

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
      this.port.postMessage({ type: 'setEnabled', value: false });
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

/** Validated minimal WASM SIMD probe (v128.const). */
const WASM_SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);

export function isSimdSupported(): boolean {
  try {
    return (
      typeof WebAssembly !== 'undefined' &&
      typeof WebAssembly.validate === 'function' &&
      WebAssembly.validate(WASM_SIMD_PROBE)
    );
  } catch {
    return false;
  }
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
