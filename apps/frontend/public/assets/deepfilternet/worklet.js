'use strict';

/**
 * Polyfill TextDecoder for AudioWorkletGlobalScope and DeepFilterNet processor.
 * `{ type: 'dispose' }` on the port stops the processor and frees the native state with `df_free`.
 * `process()` then returns false so a disconnected node can be collected while the AudioContext stays open.
 * The handle from `df_create_default` is not a wasm-bindgen `DFState`; `__wbg_dfstate_free` always
 * throws "attempted to take ownership of Rust value while it was borrowed" on it.
 *
 * AudioWorkletGlobalScope runs in a specialized real-time audio thread where standard
 * Web APIs (such as TextDecoder, XMLHttpRequest, Blob, timers) are not provided by default.
 * wasm-bindgen unconditionally executes `new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })`.
 * Standard libraries like `fast-text-encoding` throw an error when `{ fatal: true }` is passed
 * and fail to bind to global scope because `window` and `global` are undefined in AudioWorklet.
 * This minimal UTF-8 TextDecoder runs directly on `globalThis` and safely supports these options.
 */
if (typeof TextDecoder === 'undefined') {
  globalThis.TextDecoder = class TextDecoder {
    constructor(label = 'utf-8', options = {}) {
      this.encoding = label;
      this.fatal = Boolean(options?.fatal);
      this.ignoreBOM = Boolean(options?.ignoreBOM);
    }

    decode(input) {
      if (!input) return '';
      let bytes;
      if (input instanceof Uint8Array) {
        bytes = input;
      } else if (input instanceof ArrayBuffer) {
        bytes = new Uint8Array(input);
      } else if (input.buffer instanceof ArrayBuffer) {
        bytes = new Uint8Array(
          input.buffer,
          input.byteOffset,
          input.byteLength,
        );
      } else {
        bytes = new Uint8Array(input);
      }
      if (bytes.length === 0) return '';

      let s = '';
      for (let i = 0; i < bytes.length;) {
        const b0 = bytes[i++];
        if ((b0 & 0x80) === 0) {
          s += String.fromCharCode(b0);
        } else if ((b0 & 0xe0) === 0xc0) {
          const b1 = bytes[i++] & 0x3f;
          s += String.fromCharCode(((b0 & 0x1f) << 6) | b1);
        } else if ((b0 & 0xf0) === 0xe0) {
          const b1 = bytes[i++] & 0x3f;
          const b2 = bytes[i++] & 0x3f;
          s += String.fromCharCode(((b0 & 0x0f) << 12) | (b1 << 6) | b2);
        } else if ((b0 & 0xf8) === 0xf0) {
          const b1 = bytes[i++] & 0x3f;
          const b2 = bytes[i++] & 0x3f;
          const b3 = bytes[i++] & 0x3f;
          const cp =
            (((b0 & 0x07) << 18) | (b1 << 12) | (b2 << 6) | b3) - 0x10000;
          s += String.fromCharCode(0xd800 | (cp >> 10), 0xdc00 | (cp & 0x3ff));
        } else {
          s += String.fromCharCode(b0);
        }
      }
      return s;
    }
  };
}
(() => {
  // pkg/df.js
  const DFState = class {
    __destroy_into_raw() {
      const ptr = this.__wbg_ptr;
      this.__wbg_ptr = 0;
      DFStateFinalization.unregister(this);
      return ptr;
    }
    free() {
      const ptr = this.__destroy_into_raw();
      wasm.__wbg_dfstate_free(ptr, 0);
    }
  };
  if (Symbol.dispose)
    DFState.prototype[Symbol.dispose] = DFState.prototype.free;
  function df_create_default(atten_lim) {
    const ret = wasm.df_create_default(atten_lim);
    return ret >>> 0;
  }
  function df_get_frame_length(st) {
    const ret = wasm.df_get_frame_length(st);
    return ret >>> 0;
  }
  function df_process_frame(st, input) {
    const ptr0 = passArrayF32ToWasm0(
      input,
      wasm.__wbindgen_malloc_command_export,
    );
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.df_process_frame(st, ptr0, len0);
    return ret;
  }
  function df_set_atten_lim(st, lim_db) {
    wasm.df_set_atten_lim(st, lim_db);
  }
  function __wbg_get_imports() {
    const import0 = {
      __proto__: null,
      __wbg___wbindgen_throw_6b64449b9b9ed33c: function (arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
      },
      __wbg_getRandomValues_cc7f052a444bb2ce: function (...args) {
        return handleError(function (arg0, arg1) {
          globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, args);
      },
      __wbg_new_from_slice_b6858b485924da4e: function (arg0, arg1) {
        const ret = new Float32Array(getArrayF32FromWasm0(arg0, arg1));
        return ret;
      },
      __wbindgen_init_externref_table: function () {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, void 0);
        table.set(offset + 0, void 0);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
      },
    };
    return {
      __proto__: null,
      './df_bg.js': import0,
    };
  }
  const DFStateFinalization =
    typeof FinalizationRegistry === 'undefined'
      ? {
          register: () => {
            /* no-op when FinalizationRegistry is missing */
          },
          unregister: () => {
            /* no-op when FinalizationRegistry is missing */
          },
        }
      : new FinalizationRegistry((ptr) =>
          wasm.__wbg_dfstate_free(ptr >>> 0, 1),
        );
  function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc_command_export();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
  }
  function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
  }
  function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
  }
  let cachedFloat32ArrayMemory0 = null;
  function getFloat32ArrayMemory0() {
    if (
      cachedFloat32ArrayMemory0 === null ||
      cachedFloat32ArrayMemory0.byteLength === 0
    ) {
      cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
  }
  function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
  }
  let cachedUint8ArrayMemory0 = null;
  function getUint8ArrayMemory0() {
    if (
      cachedUint8ArrayMemory0 === null ||
      cachedUint8ArrayMemory0.byteLength === 0
    ) {
      cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
  }
  function handleError(f, args) {
    try {
      return f.apply(this, args);
    } catch (e) {
      const idx = addToExternrefTable0(e);
      wasm.__wbindgen_exn_store_command_export(idx);
    }
  }
  function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
  }
  let cachedTextDecoder = new TextDecoder('utf-8', {
    ignoreBOM: true,
    fatal: true,
  });
  cachedTextDecoder.decode();
  const MAX_SAFARI_DECODE_BYTES = 2146435072;
  let numBytesDecoded = 0;
  function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
      cachedTextDecoder = new TextDecoder('utf-8', {
        ignoreBOM: true,
        fatal: true,
      });
      cachedTextDecoder.decode();
      numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(
      getUint8ArrayMemory0().subarray(ptr, ptr + len),
    );
  }
  let WASM_VECTOR_LEN = 0;
  let _wasmModule;
  let wasm;
  function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    _wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
  }
  function initSync(module) {
    if (wasm !== void 0) return wasm;
    if (module !== void 0) {
      if (Object.getPrototypeOf(module) === Object.prototype) {
        ({ module } = module);
      } else {
        console.warn(
          'using deprecated parameters for `initSync()`; pass a single object instead',
        );
      }
    }
    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
      module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
  }

  // src/worklet.ts
  const PROCESSOR_NAME = 'deepfilternet-processor';
  const WORKLET_QUANTUM = 128;
  const DeepFilterProcessor = class extends AudioWorkletProcessor {
    #handle = 0;
    #frameLength = 0;
    #input = new Float32Array(0);
    #output = new Float32Array(0);
    #temp = new Float32Array(0);
    #write = 0;
    #readIn = 0;
    #writeOut = 0;
    #readOut = 0;
    #ready = false;
    #bypass = false;
    #disposed = false;
    constructor(options) {
      super();
      const opts = options.processorOptions;
      try {
        initSync({ module: opts.wasmModule });
        this.#handle = df_create_default(opts.attenuationLimit ?? 100);
        this.#frameLength = df_get_frame_length(this.#handle);
        const ring = this.#frameLength * 4;
        this.#input = new Float32Array(ring);
        this.#output = new Float32Array(ring);
        this.#temp = new Float32Array(this.#frameLength);
        this.#ready = true;
      } catch {
        this.#ready = false;
      }
      this.port.onmessage = (event) => {
        if (event.data?.type === 'dispose') {
          this.#ready = false;
          this.#disposed = true;
          this.#releaseHandle();
          this.port.onmessage = null;
          return;
        }
        if (
          event.data.type === 'setAttenuationLimit' &&
          typeof event.data.value === 'number'
        ) {
          if (this.#ready) df_set_atten_lim(this.#handle, event.data.value);
        }
        if (event.data.type === 'setEnabled') {
          this.#bypass = event.data.value === false;
        }
      };
    }
    #releaseHandle() {
      const handle = this.#handle;
      if (!handle) return;
      this.#handle = 0;
      try {
        wasm.df_free(handle >>> 0);
      } catch {
        // A second free traps. The processor is already stopped.
      }
    }
    #available(write, read) {
      return (write - read + this.#input.length) % this.#input.length;
    }
    process(inputs, outputs) {
      if (this.#disposed) return false;
      const input = inputs[0]?.[0];
      const output = outputs[0]?.[0];
      if (!input || !output) return true;
      if (!this.#ready || this.#bypass) {
        for (const dest of outputs) {
          for (const channel of dest) channel.set(input);
        }
        return true;
      }
      const ring = this.#input.length;
      for (let i = 0; i < input.length; i++) {
        this.#input[this.#write] = input[i];
        this.#write = (this.#write + 1) % ring;
      }
      while (this.#available(this.#write, this.#readIn) >= this.#frameLength) {
        for (let i = 0; i < this.#frameLength; i++) {
          this.#temp[i] = this.#input[this.#readIn];
          this.#readIn = (this.#readIn + 1) % ring;
        }
        const processed = df_process_frame(this.#handle, this.#temp);
        for (let i = 0; i < processed.length; i++) {
          this.#output[this.#writeOut] = processed[i];
          this.#writeOut = (this.#writeOut + 1) % ring;
        }
      }
      if (this.#available(this.#writeOut, this.#readOut) >= WORKLET_QUANTUM) {
        for (const dest of outputs) {
          for (const channel of dest) {
            let pos = this.#readOut;
            for (let i = 0; i < WORKLET_QUANTUM; i++) {
              channel[i] = this.#output[pos];
              pos = (pos + 1) % ring;
            }
          }
        }
        this.#readOut = (this.#readOut + WORKLET_QUANTUM) % ring;
      }
      return true;
    }
  };
  registerProcessor(PROCESSOR_NAME, DeepFilterProcessor);
})();
