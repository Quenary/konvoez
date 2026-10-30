import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const workletPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../public/assets/deepfilternet/worklet.js',
);

interface ProcessorPortMessage {
  data: {
    type: string;
    value?: number | boolean;
  };
}

interface WorkletProcessorInstance {
  port: {
    onmessage: ((event: ProcessorPortMessage) => void) | null;
  };
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
}

type WorkletProcessorConstructor = new (options: {
  processorOptions: {
    wasmModule?: WebAssembly.Module;
    attenuationLimit?: number;
  };
}) => WorkletProcessorInstance;

interface TextDecoderPolyfill {
  new (
    label?: string,
    options?: { fatal?: boolean; ignoreBOM?: boolean },
  ): {
    encoding: string;
    fatal: boolean;
    ignoreBOM: boolean;
    decode: (input?: BufferSource) => string;
  };
}

function loadWorklet(initialGlobals?: Record<string, unknown>): {
  registeredName: string;
  registeredCtor: WorkletProcessorConstructor;
  context: vm.Context & {
    TextDecoder: TextDecoderPolyfill;
  };
} {
  let registeredName: string | null = null;
  let registeredCtor: WorkletProcessorConstructor | null = null;

  const context = vm.createContext({
    sampleRate: 48000,
    registerProcessor: (name: string, ctor: WorkletProcessorConstructor) => {
      registeredName = name;
      registeredCtor = ctor;
    },
    AudioWorkletProcessor: class AudioWorkletProcessor {
      port = { onmessage: null };
    },
    ...initialGlobals,
  });

  vm.runInContext(readFileSync(workletPath, 'utf8'), context);

  if (!registeredName || !registeredCtor) {
    throw new Error('worklet did not register processor');
  }

  return {
    registeredName,
    registeredCtor,
    context: context as vm.Context & {
      TextDecoder: TextDecoderPolyfill;
    },
  };
}

describe('deepfilternet worklet', () => {
  describe('TextDecoder polyfill', () => {
    it('creates a global TextDecoder if undefined in AudioWorkletGlobalScope', () => {
      const { context } = loadWorklet();
      expect(context.TextDecoder).toBeDefined();
      expect(typeof context.TextDecoder).toBe('function');
    });

    it('safely accepts fatal and ignoreBOM options without throwing', () => {
      const { context } = loadWorklet();
      const decoder = new context.TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      });

      expect(decoder.encoding).toBe('utf-8');
      expect(decoder.fatal).toBe(true);
      expect(decoder.ignoreBOM).toBe(true);
    });

    it('decodes empty or falsy inputs to empty string', () => {
      const { context } = loadWorklet();
      const decoder = new context.TextDecoder();

      expect(decoder.decode()).toBe('');
      expect(decoder.decode(new Uint8Array(0))).toBe('');
    });

    it('decodes ASCII, Cyrillic, and surrogate pairs (emojis)', () => {
      const { context } = loadWorklet();
      const decoder = new context.TextDecoder();
      const testCases = [
        'Hello World',
        'Привет, мир!',
        'DeepFilterNet 3 🚀🎧',
        'Special: € © ™',
      ];

      for (const str of testCases) {
        const encoded = new TextEncoder().encode(str);
        expect(decoder.decode(encoded)).toBe(str);
      }
    });

    it('decodes from ArrayBuffer and TypedArray views', () => {
      const { context } = loadWorklet();
      const decoder = new context.TextDecoder();
      const text = 'BufferSource test';
      const encoded = new TextEncoder().encode(text);

      expect(decoder.decode(encoded.buffer)).toBe(text);

      const offsetView = new Uint8Array(encoded.buffer, 0, encoded.length);
      expect(decoder.decode(offsetView)).toBe(text);
    });

    it('does not overwrite pre-existing TextDecoder if already defined in environment', () => {
      class PreExistingDecoder {
        encoding = 'custom-existing';
        decode() {
          return 'mock';
        }
      }

      const { context } = loadWorklet({
        TextDecoder: PreExistingDecoder,
      });

      expect(context.TextDecoder).toBe(PreExistingDecoder);
    });
  });

  describe('DeepFilterProcessor registration and fallback', () => {
    it("registers processor with name 'deepfilternet-processor'", () => {
      const { registeredName } = loadWorklet();
      expect(registeredName).toBe('deepfilternet-processor');
    });

    it('initializes in bypass mode when no wasm module is provided without throwing', () => {
      const { registeredCtor: Processor } = loadWorklet();
      const processor = new Processor({ processorOptions: {} });

      expect(processor).toBeDefined();
    });

    it('passes audio through transparently when uninitialized or in bypass mode', () => {
      const { registeredCtor: Processor } = loadWorklet();
      const processor = new Processor({ processorOptions: {} });

      const inputChannel = new Float32Array([0.25, -0.5, 0.75, -1.0]);
      const outputChannel = new Float32Array(4);

      const keepAlive = processor.process([[inputChannel]], [[outputChannel]]);
      expect(keepAlive).toBe(true);
      expect(Array.from(outputChannel)).toEqual(Array.from(inputChannel));
    });

    it('handles empty or missing input/output gracefully', () => {
      const { registeredCtor: Processor } = loadWorklet();
      const processor = new Processor({ processorOptions: {} });

      expect(processor.process([], [])).toBe(true);
      expect(processor.process([[]], [[]])).toBe(true);
    });

    it('toggles bypass state when receiving setEnabled port messages', () => {
      const { registeredCtor: Processor } = loadWorklet();
      const processor = new Processor({ processorOptions: {} });

      expect(processor.port.onmessage).toBeDefined();

      processor.port.onmessage?.({
        data: { type: 'setEnabled', value: false },
      });

      const input = new Float32Array([0.1, 0.2]);
      const output = new Float32Array(2);
      processor.process([[input]], [[output]]);
      expect(Array.from(output)).toEqual(Array.from(input));

      processor.port.onmessage?.({
        data: { type: 'setEnabled', value: true },
      });
      processor.port.onmessage?.({
        data: { type: 'setAttenuationLimit', value: 30 },
      });
    });

    it('disposes native state and causes process() to return false', () => {
      const freeFn = vi.fn();
      const wbgFree = vi.fn();
      const mockWasmExports = {
        __wbindgen_start: vi.fn(),
        df_create_default: vi.fn().mockReturnValue(42),
        df_get_frame_length: vi.fn().mockReturnValue(480),
        df_free: freeFn,
        __wbg_dfstate_free: wbgFree,
      };

      const { registeredCtor: Processor } = loadWorklet({
        WebAssembly: {
          Module: class MockModule {},
          Instance: class MockInstance {
            exports = mockWasmExports;
          },
        },
      });

      const processor = new Processor({
        processorOptions: {
          wasmModule: {} as WebAssembly.Module,
        },
      });

      expect(processor.port.onmessage).toBeDefined();

      const input = new Float32Array([0.1, 0.2]);
      const output = new Float32Array(2);
      expect(processor.process([[input]], [[output]])).toBe(true);

      processor.port.onmessage?.({
        data: { type: 'dispose' },
      });

      expect(freeFn).toHaveBeenCalledTimes(1);
      expect(freeFn).toHaveBeenCalledWith(42);
      expect(wbgFree).not.toHaveBeenCalled();
      expect(processor.process([[input]], [[output]])).toBe(false);
      expect(processor.port.onmessage).toBeNull();
    });

    it('stops the processor when native free throws and does not free twice', () => {
      const freeFn = vi.fn(() => {
        throw new Error(
          'attempted to take ownership of Rust value while it was borrowed',
        );
      });
      const { registeredCtor: Processor } = loadWorklet({
        WebAssembly: {
          Module: class MockModule {},
          Instance: class MockInstance {
            exports = {
              __wbindgen_start: vi.fn(),
              df_create_default: vi.fn().mockReturnValue(42),
              df_get_frame_length: vi.fn().mockReturnValue(480),
              df_free: freeFn,
            };
          },
        },
      });

      const processor = new Processor({
        processorOptions: {
          wasmModule: {} as WebAssembly.Module,
        },
      });
      const onmessage = processor.port.onmessage;

      expect(() => {
        onmessage?.({ data: { type: 'dispose' } });
      }).not.toThrow();

      const input = new Float32Array([0.1, 0.2]);
      const output = new Float32Array(2);
      expect(processor.process([[input]], [[output]])).toBe(false);
      expect(freeFn).toHaveBeenCalledTimes(1);

      expect(() => {
        onmessage?.({ data: { type: 'dispose' } });
      }).not.toThrow();
      expect(freeFn).toHaveBeenCalledTimes(1);
    });

    it('handles dispose safely when uninitialized and does not throw on second call', () => {
      const { registeredCtor: Processor } = loadWorklet();
      const processor = new Processor({ processorOptions: {} });

      const onmessage = processor.port.onmessage;
      expect(onmessage).toBeDefined();

      onmessage?.({
        data: { type: 'dispose' },
      });

      const input = new Float32Array([0.1, 0.2]);
      const output = new Float32Array(2);
      expect(processor.process([[input]], [[output]])).toBe(false);
      expect(processor.port.onmessage).toBeNull();

      expect(() => {
        onmessage?.({
          data: { type: 'dispose' },
        });
      }).not.toThrow();
    });
  });
});
