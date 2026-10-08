import { InjectionToken } from '@angular/core';
import {
  RnnoiseWorkletNode,
  SpeexWorkletNode,
  loadRnnoise,
  loadSpeex,
} from '@sapphi-red/web-noise-suppressor';

export type NoiseSuppressorPort = {
  loadRnnoise: typeof loadRnnoise;
  loadSpeex: typeof loadSpeex;
  RnnoiseWorkletNode: typeof RnnoiseWorkletNode;
  SpeexWorkletNode: typeof SpeexWorkletNode;
};

export const NOISE_SUPPRESSOR_PORT = new InjectionToken<NoiseSuppressorPort>(
  'NOISE_SUPPRESSOR_PORT',
  {
    providedIn: 'root',
    factory: (): NoiseSuppressorPort => ({
      loadRnnoise,
      loadSpeex,
      RnnoiseWorkletNode,
      SpeexWorkletNode,
    }),
  },
);
