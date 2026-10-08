import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  VOICE_DYNAMICS_PROCESSOR,
  VOICE_EXPANDER_OPTIONS,
  VOICE_LIMITER_OPTIONS,
} from './voice-dynamics';

const workletPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../public/audio/voice-dynamics.worklet.js',
);

function loadProcessor(): new (options: { processorOptions: object }) => {
  port: {
    onmessage: ((event: { data?: { type?: string } }) => void) | null;
  };
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
} {
  let registered:
    | (new (options: { processorOptions: object }) => {
        port: {
          onmessage: ((event: { data?: { type?: string } }) => void) | null;
        };
        process: (
          inputs: Float32Array[][],
          outputs: Float32Array[][],
        ) => boolean;
      })
    | null = null;
  const context = vm.createContext({
    sampleRate: 48000,
    registerProcessor: (
      name: string,
      ctor: new (options: { processorOptions: object }) => {
        port: {
          onmessage: ((event: { data?: { type?: string } }) => void) | null;
        };
        process: (
          inputs: Float32Array[][],
          outputs: Float32Array[][],
        ) => boolean;
      },
    ) => {
      expect(name).toBe(VOICE_DYNAMICS_PROCESSOR);
      registered = ctor;
    },
    AudioWorkletProcessor: class AudioWorkletProcessor {
      port: {
        onmessage: ((event: { data?: { type?: string } }) => void) | null;
      } = { onmessage: null };
    },
  });
  vm.runInContext(readFileSync(workletPath, 'utf8'), context);
  if (!registered) {
    throw new Error('worklet did not register');
  }
  return registered;
}

function render(
  processor: {
    process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
  },
  blocks: Float32Array[],
): Float32Array[] {
  return blocks.map((block) => {
    const output = new Float32Array(block.length);
    processor.process([[block]], [[output]]);
    return output;
  });
}

function constantBlock(value: number, length = 128): Float32Array {
  return new Float32Array(length).fill(value);
}

function peak(blocks: Float32Array[]): number {
  let max = 0;
  for (const block of blocks) {
    for (const sample of block) {
      max = Math.max(max, Math.abs(sample));
    }
  }
  return max;
}

describe('voice dynamics worklet', () => {
  const Processor = loadProcessor();

  it('keeps quiet noise attenuated and lets speech through', () => {
    const processor = new Processor({
      processorOptions: VOICE_EXPANDER_OPTIONS,
    });
    const quiet = render(
      processor,
      Array.from({ length: 20 }, () => constantBlock(0.001)),
    );
    expect(peak(quiet)).toBeLessThan(0.0001);

    const speech = render(
      processor,
      Array.from({ length: 12 }, () => constantBlock(0.25)),
    );
    const last = speech[speech.length - 1];
    const mean =
      last.reduce((sum, sample) => sum + Math.abs(sample), 0) / last.length;
    expect(mean).toBeGreaterThan(0.2);
  });

  it('closes the gate after speech returns to the noise floor', () => {
    const processor = new Processor({
      processorOptions: VOICE_EXPANDER_OPTIONS,
    });
    render(
      processor,
      Array.from({ length: 20 }, () => constantBlock(0.001)),
    );
    const speech = render(
      processor,
      Array.from({ length: 12 }, () => constantBlock(0.25)),
    );
    const spoken = speech[speech.length - 1];
    const spokenMean =
      spoken.reduce((sum, sample) => sum + Math.abs(sample), 0) / spoken.length;
    expect(spokenMean).toBeGreaterThan(0.2);

    const after = render(
      processor,
      Array.from({ length: 400 }, () => constantBlock(0.001)),
    );
    const tail = after[after.length - 1];
    const tailMean =
      tail.reduce((sum, sample) => sum + Math.abs(sample), 0) / tail.length;
    expect(tailMean).toBeLessThan(0.0001);
  });

  it('reaches at least -3 dB gain by the first output sample of the onset', () => {
    const processor = new Processor({
      processorOptions: VOICE_EXPANDER_OPTIONS,
    });
    render(
      processor,
      Array.from({ length: 20 }, () => constantBlock(0.001)),
    );
    const speech = render(
      processor,
      Array.from({ length: 3 }, () => constantBlock(0.25)),
    );
    expect(speech[0][0]).toBeLessThan(0.001);

    const firstOnsetSample = speech[1][240 - 128];
    const gainAtOnset = firstOnsetSample / 0.25;
    const gainDb = 20 * Math.log10(gainAtOnset);
    expect(gainDb).toBeGreaterThanOrEqual(-3);
  });

  it('does not open the gate on bursty low-level noise', () => {
    const processor = new Processor({
      processorOptions: VOICE_EXPANDER_OPTIONS,
    });
    render(
      processor,
      Array.from({ length: 20 }, () => constantBlock(0.0015)),
    );

    const burstyBlocks = Array.from({ length: 20 }, (_, i) => {
      const b = constantBlock(0.0015);
      if (i % 3 === 0) {
        b.fill(0.0035);
      }
      return b;
    });

    const rendered = render(processor, burstyBlocks);
    expect(peak(rendered)).toBeLessThan(0.001);
  });

  it('holds a full-scale burst under the ceiling', () => {
    const processor = new Processor({
      processorOptions: VOICE_LIMITER_OPTIONS,
    });
    const ceiling = 10 ** (-1 / 20);
    const spike = constantBlock(0);
    spike[0] = 1;
    const rendered = render(processor, [
      constantBlock(0),
      spike,
      constantBlock(0),
      constantBlock(0),
    ]);
    const limited = peak(rendered);
    expect(limited).toBeGreaterThan(0.5);
    expect(limited).toBeLessThanOrEqual(ceiling + 1e-6);

    const hot = render(
      processor,
      Array.from({ length: 6 }, () => constantBlock(1)),
    );
    const settled = hot.slice(2);
    expect(peak(settled)).toBeLessThanOrEqual(ceiling + 1e-6);
    expect(peak(settled)).toBeGreaterThan(0.5);
  });

  it('strictly clamps peaks at 2.0 and 4.0 to never exceed the ceiling', () => {
    const processor = new Processor({
      processorOptions: VOICE_LIMITER_OPTIONS,
    });
    const ceiling = 10 ** (-1 / 20);

    for (const amp of [2.0, 4.0]) {
      const spike = constantBlock(0);
      spike[0] = amp;
      const rendered = render(processor, [
        constantBlock(0),
        spike,
        constantBlock(0),
        constantBlock(0),
      ]);
      expect(peak(rendered)).toBeLessThanOrEqual(ceiling + 1e-6);

      const hot = render(
        processor,
        Array.from({ length: 6 }, () => constantBlock(amp)),
      );
      expect(peak(hot)).toBeLessThanOrEqual(ceiling + 1e-6);
    }
  });

  it('passes a moderate level without limiting', () => {
    const processor = new Processor({
      processorOptions: VOICE_LIMITER_OPTIONS,
    });
    const rendered = render(
      processor,
      Array.from({ length: 4 }, () => constantBlock(0.2)),
    );
    const last = rendered[rendered.length - 1];
    const mean =
      last.reduce((sum, sample) => sum + Math.abs(sample), 0) / last.length;
    expect(mean).toBeGreaterThan(0.18);
    expect(mean).toBeLessThan(0.22);
  });

  it('stops after dispose so a disconnected node can be collected', () => {
    const processor = new Processor({
      processorOptions: VOICE_LIMITER_OPTIONS,
    });
    const output = new Float32Array(128);
    expect(processor.process([[constantBlock(0.2)]], [[output]])).toBe(true);
    processor.port.onmessage?.({ data: { type: 'dispose' } });
    expect(processor.process([[constantBlock(0.2)]], [[output]])).toBe(false);
  });
});
