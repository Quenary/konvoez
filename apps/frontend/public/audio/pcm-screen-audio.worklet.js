/**
 * AudioWorkletProcessor that reads 48 kHz Float32 stereo PCM chunks
 * from a transferred MessagePort (emitted by native desktop capture)
 * and streams them into the Web Audio graph via a bounded 100 ms ring buffer.
 */
const PROCESSOR_NAME = 'konvoez/pcm-screen-audio';

class PcmScreenAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // 100 ms buffer at 48 kHz stereo: 4800 frames * 2 channels = 9600 samples
    this.capacity = 9600;
    this.ringBuffer = new Float32Array(this.capacity);
    this.writePos = 0;
    this.readPos = 0;
    this.available = 0;
    this.started = false;
    this.audioPort = null;
    this.disposed = false;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data === 'stop' || data.type === 'stop') {
        this.dispose();
        return;
      }

      if (event.ports && event.ports[0]) {
        this.attachPort(event.ports[0]);
      } else if (
        data instanceof MessagePort ||
        (data && (typeof data.close === 'function' || 'onmessage' in data))
      ) {
        this.attachPort(data);
      }
    };
  }

  attachPort(port) {
    if (this.audioPort) {
      try {
        this.audioPort.onmessage = null;
        this.audioPort.close();
      } catch {
        // best-effort
      }
    }

    this.audioPort = port;
    if (!port) return;

    port.onmessage = (event) => {
      if (this.disposed) return;
      const data = event.data;
      if (!data) return;

      if (data === 'stop') {
        this.dispose();
        return;
      }

      let float32View = null;
      if (
        data instanceof Float32Array ||
        data?.constructor?.name === 'Float32Array'
      ) {
        float32View = data;
      } else if (
        data instanceof ArrayBuffer ||
        data?.constructor?.name === 'ArrayBuffer'
      ) {
        float32View = new Float32Array(data);
      } else if (ArrayBuffer.isView(data) || data?.buffer) {
        const offset = data.byteOffset || 0;
        const byteLen = data.byteLength || 0;
        if (offset % 4 === 0) {
          float32View = new Float32Array(
            data.buffer,
            offset,
            Math.floor(byteLen / 4),
          );
        } else {
          // Unaligned slice: copy bytes into an aligned buffer to avoid RangeError
          const slice = data.buffer.slice(offset, offset + byteLen);
          float32View = new Float32Array(slice);
        }
      }

      if (float32View && float32View.length > 0) {
        this.pushSamples(float32View);
      }
    };
  }

  pushSamples(samples) {
    let toPush = samples;
    // If chunk exceeds total ring buffer capacity, keep only the most recent samples
    if (toPush.length > this.capacity) {
      let excess = toPush.length - this.capacity;
      if (excess % 2 !== 0) {
        excess += 1; // Preserve stereo interleaved alignment
      }
      toPush = toPush.subarray(excess);
    }

    const len = toPush.length;
    if (len === 0) return;

    // Bound latency: if ring buffer would overflow, drop oldest unread samples
    if (this.available + len > this.capacity) {
      let overflow = this.available + len - this.capacity;
      // Ensure stereo phase alignment: always drop an even number of samples
      if (overflow % 2 !== 0) {
        overflow += 1;
      }
      this.readPos = (this.readPos + overflow) % this.capacity;
      this.available = Math.max(0, this.available - overflow);
    }

    // Write circular
    for (let i = 0; i < len; i++) {
      this.ringBuffer[this.writePos] = toPush[i];
      this.writePos = (this.writePos + 1) % this.capacity;
    }
    this.available += len;

    // Pre-buffer at least ~20 ms (1920 samples) before starting playback to prevent immediate underflow
    if (!this.started && this.available >= 1920) {
      this.started = true;
    }
  }

  dispose() {
    this.disposed = true;
    if (this.audioPort) {
      try {
        this.audioPort.postMessage('stop');
        this.audioPort.onmessage = null;
        this.audioPort.close();
      } catch {
        // best-effort
      }
      this.audioPort = null;
    }
    this.available = 0;
  }

  process(inputs, outputs) {
    if (this.disposed) {
      return false;
    }

    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const left = output[0];
    const right = output[1] || output[0];
    const frameCount = left.length; // Standard Web Audio quantum is 128 frames
    const requiredSamples = frameCount * 2; // Interleaved stereo

    if (!this.started || this.available < requiredSamples) {
      // Underflow: fill with silence
      left.fill(0);
      if (right && right !== left) {
        right.fill(0);
      }
      return true;
    }

    for (let i = 0; i < frameCount; i++) {
      left[i] = this.ringBuffer[this.readPos];
      right[i] = this.ringBuffer[(this.readPos + 1) % this.capacity];
      this.readPos = (this.readPos + 2) % this.capacity;
    }
    this.available -= requiredSamples;

    return true;
  }
}

registerProcessor(PROCESSOR_NAME, PcmScreenAudioProcessor);
