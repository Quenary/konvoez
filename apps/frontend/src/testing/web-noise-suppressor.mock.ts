import { vi } from 'vitest';

export const noiseSuppressorWorkletNodes = vi.hoisted(() => ({
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

vi.mock('@sapphi-red/web-noise-suppressor', () => ({
  SpeexWorkletNode: class SpeexWorkletNode {
    connect = vi.fn();
    disconnect = vi.fn();
    destroy = vi.fn();
    constructor() {
      noiseSuppressorWorkletNodes.speex.push(this);
    }
  },
  RnnoiseWorkletNode: class RnnoiseWorkletNode {
    connect = vi.fn();
    disconnect = vi.fn();
    destroy = vi.fn();
    constructor() {
      noiseSuppressorWorkletNodes.rnnoise.push(this);
    }
  },
  loadSpeex: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  loadRnnoise: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
}));
