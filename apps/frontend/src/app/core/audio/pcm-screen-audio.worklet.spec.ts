import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const workletPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../public/audio/pcm-screen-audio.worklet.js',
);

interface IWorkletProcessor {
  port: {
    onmessage: ((event: { data?: unknown; ports?: unknown[] }) => void) | null;
  };
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
}

function loadProcessor(): new () => IWorkletProcessor {
  let registered: (new () => IWorkletProcessor) | null = null;

  class BaseAudioWorkletProcessor {
    port = {
      onmessage: null as
        ((event: { data?: unknown; ports?: unknown[] }) => void) | null,
    };
  }

  const context = vm.createContext({
    AudioWorkletProcessor: BaseAudioWorkletProcessor,
    registerProcessor: (name: string, ctor: new () => IWorkletProcessor) => {
      expect(name).toBe('konvoez/pcm-screen-audio');
      registered = ctor;
    },
    Float32Array,
    ArrayBuffer,
    MessagePort: class MockPort {},
  });

  const code = readFileSync(workletPath, 'utf8');
  vm.runInContext(code, context);

  if (!registered) {
    throw new Error('Processor not registered');
  }
  return registered;
}

describe('pcm-screen-audio.worklet', () => {
  it('registers processor and outputs silence before sufficient samples are buffered', () => {
    const Ctor = loadProcessor();
    const processor = new Ctor();

    const outputLeft = new Float32Array(128).fill(1);
    const outputRight = new Float32Array(128).fill(1);
    const outputs = [[outputLeft, outputRight]];

    const active = processor.process([], outputs);
    expect(active).toBe(true);
    // Underflow silence
    expect(outputLeft.every((v) => v === 0)).toBe(true);
    expect(outputRight.every((v) => v === 0)).toBe(true);
  });

  it('receives audio port and plays back interleaved stereo samples after pre-buffer threshold', () => {
    const Ctor = loadProcessor();
    const processor = new Ctor();

    let portMessageListener: ((event: { data?: unknown }) => void) | null =
      null;
    const mockAudioPort = {
      set onmessage(fn: (event: { data?: unknown }) => void) {
        portMessageListener = fn;
      },
      close: vi.fn(),
    };

    processor.port.onmessage?.({ data: mockAudioPort });
    expect(portMessageListener).toBeDefined();

    // Push 2000 samples (1000 frames) of alternating 0.5 (left) and -0.5 (right)
    const samples = new Float32Array(2000);
    for (let i = 0; i < 2000; i += 2) {
      samples[i] = 0.5;
      samples[i + 1] = -0.5;
    }
    const listenerA = portMessageListener as
      ((event: { data?: unknown }) => void) | null;
    listenerA?.({ data: samples });

    const outputLeft = new Float32Array(128);
    const outputRight = new Float32Array(128);
    const outputs = [[outputLeft, outputRight]];

    const active = processor.process([], outputs);
    expect(active).toBe(true);
    expect(outputLeft[0]).toBeCloseTo(0.5);
    expect(outputRight[0]).toBeCloseTo(-0.5);
  });

  it('drops oldest samples on overflow to maintain bounded latency', () => {
    const Ctor = loadProcessor();
    const processor = new Ctor();

    let portMessageListener: ((event: { data?: unknown }) => void) | null =
      null;
    const mockAudioPort = {
      set onmessage(fn: (event: { data?: unknown }) => void) {
        portMessageListener = fn;
      },
      close: vi.fn(),
    };
    processor.port.onmessage?.({ data: mockAudioPort });

    // Push 10,000 samples (exceeding 9600 capacity)
    const samples = new Float32Array(10000);
    samples.fill(0.25);
    // Last 100 samples with 0.75
    samples.fill(0.75, 9900);

    const listenerB = portMessageListener as
      ((event: { data?: unknown }) => void) | null;
    listenerB?.({ data: samples });

    const outputLeft = new Float32Array(128);
    const outputRight = new Float32Array(128);
    const active = processor.process([], [[outputLeft, outputRight]]);
    expect(active).toBe(true);
  });

  it('stops and returns false when stop command is received', () => {
    const Ctor = loadProcessor();
    const processor = new Ctor();

    processor.port.onmessage?.({ data: 'stop' });
    const outputLeft = new Float32Array(128);
    const active = processor.process([], [[outputLeft]]);
    expect(active).toBe(false);
  });
});
