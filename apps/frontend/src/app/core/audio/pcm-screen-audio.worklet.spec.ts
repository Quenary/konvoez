import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

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

  it('plays PCM ArrayBuffers sent directly to the worklet port', () => {
    const Ctor = loadProcessor();
    const processor = new Ctor();
    const samples = new Float32Array(2000);
    for (let i = 0; i < samples.length; i += 2) {
      samples[i] = 0.5;
      samples[i + 1] = -0.5;
    }

    processor.port.onmessage?.({ data: samples.buffer });

    const outputLeft = new Float32Array(128);
    const outputRight = new Float32Array(128);
    processor.process([], [[outputLeft, outputRight]]);
    expect(outputLeft[0]).toBeCloseTo(0.5);
    expect(outputRight[0]).toBeCloseTo(-0.5);
  });

  it('plays interleaved Float32 stereo samples after the pre-buffer threshold', () => {
    const Ctor = loadProcessor();
    const processor = new Ctor();

    const samples = new Float32Array(2000);
    for (let i = 0; i < 2000; i += 2) {
      samples[i] = 0.5;
      samples[i + 1] = -0.5;
    }
    processor.port.onmessage?.({ data: samples });

    const outputLeft = new Float32Array(128);
    const outputRight = new Float32Array(128);
    const active = processor.process([], [[outputLeft, outputRight]]);
    expect(active).toBe(true);
    expect(outputLeft[0]).toBeCloseTo(0.5);
    expect(outputRight[0]).toBeCloseTo(-0.5);
  });

  it('drops oldest samples on overflow to maintain bounded latency', () => {
    const Ctor = loadProcessor();
    const processor = new Ctor();

    // Push 10,000 samples (exceeding 9600 capacity)
    const samples = new Float32Array(10000);
    samples.fill(0.25);
    // Last 100 samples with 0.75
    samples.fill(0.75, 9900);
    processor.port.onmessage?.({ data: samples });

    const outputLeft = new Float32Array(128);
    const outputRight = new Float32Array(128);
    const active = processor.process([], [[outputLeft, outputRight]]);
    expect(active).toBe(true);
  });

  it('preserves stereo channel alignment (left/right) when overflow drops samples', () => {
    const Ctor = loadProcessor();
    const processor = new Ctor();

    // Pre-fill buffer close to capacity: 9500 samples
    const fill = new Float32Array(9500);
    for (let i = 0; i < 9500; i += 2) {
      fill[i] = 1.0; // Left
      fill[i + 1] = -1.0; // Right
    }
    processor.port.onmessage?.({ data: fill });

    // Push odd-length chunk of 201 samples to trigger overflow with odd value
    const oddChunk = new Float32Array(201);
    for (let i = 0; i < 200; i += 2) {
      oddChunk[i] = 0.5; // Left
      oddChunk[i + 1] = -0.5; // Right
    }
    oddChunk[200] = 0.5;
    processor.port.onmessage?.({ data: oddChunk });

    // Process one quantum (128 frames = 256 samples)
    const outLeft = new Float32Array(128);
    const outRight = new Float32Array(128);
    processor.process([], [[outLeft, outRight]]);

    // Left channel should be positive (1.0 or 0.5), right should be negative (-1.0 or -0.5)
    expect(outLeft[0]).toBeGreaterThan(0);
    expect(outRight[0]).toBeLessThan(0);
  });

  it('handles unaligned byteOffset in views without throwing RangeError', () => {
    const Ctor = loadProcessor();
    const processor = new Ctor();

    // Create a buffer with unaligned byteOffset (e.g. 1 byte offset)
    const rawBuffer = new ArrayBuffer(2000);
    const unalignedView = new Uint8Array(rawBuffer, 1, 1000);

    expect(() => {
      processor.port.onmessage?.({ data: unalignedView });
    }).not.toThrow();
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
