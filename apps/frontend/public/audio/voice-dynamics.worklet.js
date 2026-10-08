/**
 * Soft expander and lookahead peak limiter for the voice graph.
 * Capture uses two nodes (expander, then limiter) so a DynamicsCompressor
 * can sit between them. Playback uses one limiter on the speaker mix bus.
 * `{ type: 'dispose' }` on the port makes process() return false so a
 * disconnected node can be collected while the AudioContext stays open.
 */
const PROCESSOR_NAME = 'konvoez/voice-dynamics';
const SILENCE_DB = -100;

function dbToGain(db) {
  return 10 ** (db / 20);
}

function gainToDb(gain) {
  return 20 * Math.log10(Math.max(gain, 1e-8));
}

function onePoleCoef(sampleCount) {
  return 1 - Math.exp(-1 / Math.max(1, sampleCount));
}

class VoiceDynamicsProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options?.processorOptions ?? {};
    this.expanderEnabled = !!opts.expander;
    this.limiterEnabled = !!opts.limiter;

    this.openMarginDb = opts.openMarginDb ?? 14;
    this.closeMarginDb = opts.closeMarginDb ?? 8;
    this.holdMs = opts.holdMs ?? 150;
    this.attackMs = opts.attackMs ?? 5;
    this.releaseMs = opts.releaseMs ?? 120;
    this.maxReductionDb = opts.maxReductionDb ?? 40;
    this.expanderLookahead = opts.expanderLookaheadSamples ?? 240;
    this.detectorReleaseMs = 40;

    this.ceiling = dbToGain(opts.ceilingDb ?? -1);
    this.lookahead = opts.lookaheadSamples ?? 128;
    this.limiterReleaseMs = opts.limiterReleaseMs ?? 50;

    this.minGain = dbToGain(-this.maxReductionDb);
    this.envGain = this.expanderEnabled ? this.minGain : 1;
    this.detectorDb = SILENCE_DB;
    this.detectorReady = false;
    this.gate = 'closed';
    this.holdLeft = 0;

    this.subMs = 250;
    this.subCount = 8;
    this.subMin = new Float64Array(this.subCount);
    this.subMin.fill(-55);
    this.subIndex = 0;
    this.subElapsed = 0;
    this.noiseFloor = -55;

    // Reaches at least -3 dB inside the attack time so onsets inside lookahead are preserved.
    this.attackCoef =
      1 -
      (1 - dbToGain(-3)) **
        (1 / Math.max(1, sampleRate * (this.attackMs / 1000)));
    this.releaseCoef = onePoleCoef(sampleRate * (this.releaseMs / 1000));
    this.limiterReleaseCoef = onePoleCoef(
      sampleRate * (this.limiterReleaseMs / 1000),
    );
    // 99% of a downward move lands inside the lookahead, so the peak is already tamed.
    this.limiterAttackCoef = 1 - 0.01 ** (1 / this.lookahead);

    this.expanderDelay = [];
    this.expanderWriteIndex = 0;
    this.delay = [];
    this.delayed = new Float32Array(0);
    this.writeIndex = 0;
    this.limiterGain = 1;
    this.peakValues = new Float32Array(this.lookahead);
    this.peakIndices = new Float64Array(this.lookahead);
    this.peakHead = 0;
    this.peakCount = 0;
    this.written = 0;
    this.disposed = false;
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'dispose') {
        this.disposed = true;
      }
    };
  }

  ensureExpanderDelay(channelCount) {
    if (this.expanderDelay.length === channelCount) {
      return;
    }
    this.expanderDelay = [];
    for (let channel = 0; channel < channelCount; channel++) {
      this.expanderDelay.push(new Float32Array(this.expanderLookahead));
    }
    this.expanderWriteIndex = 0;
  }

  ensureDelay(channelCount) {
    if (this.delay.length === channelCount) {
      return;
    }
    this.delay = [];
    for (let channel = 0; channel < channelCount; channel++) {
      this.delay.push(new Float32Array(this.lookahead));
    }
    this.delayed = new Float32Array(channelCount);
    this.writeIndex = 0;
    this.limiterGain = 1;
    this.peakHead = 0;
    this.peakCount = 0;
    this.written = 0;
  }

  /**
   * Maximum of the last `lookahead` samples. The deque drops expired
   * indices and values that can no longer be the max, so each sample is O(1).
   */
  pushPeak(value) {
    const index = this.written;
    const minIndex = index - this.lookahead + 1;
    while (this.peakCount > 0 && this.peakIndices[this.peakHead] < minIndex) {
      this.peakHead = (this.peakHead + 1) % this.lookahead;
      this.peakCount -= 1;
    }
    while (this.peakCount > 0) {
      const back = (this.peakHead + this.peakCount - 1) % this.lookahead;
      if (this.peakValues[back] > value) {
        break;
      }
      this.peakCount -= 1;
    }
    const slot = (this.peakHead + this.peakCount) % this.lookahead;
    this.peakValues[slot] = value;
    this.peakIndices[slot] = index;
    this.peakCount += 1;
    this.written += 1;
    return this.peakValues[this.peakHead];
  }

  blockLevelDb(channels) {
    let sum = 0;
    let count = 0;
    for (let channel = 0; channel < channels.length; channel++) {
      const data = channels[channel];
      for (let index = 0; index < data.length; index++) {
        const sample = data[index];
        sum += sample * sample;
      }
      count += data.length;
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    return Math.max(SILENCE_DB, gainToDb(rms));
  }

  updateDetector(levelDb, blockMs) {
    const tauMs =
      levelDb > this.detectorDb ? this.attackMs : this.detectorReleaseMs;
    const coef = 1 - Math.exp(-blockMs / tauMs);
    this.detectorDb += (levelDb - this.detectorDb) * coef;
  }

  /**
   * Minimum over eight 250 ms windows (~2 s).
   * The floor falls as soon as a quieter block lands, and rises only when
   * that quiet window ages out.
   */
  updateFloor(levelDb, blockMs) {
    if (levelDb <= -90) {
      return;
    }
    this.subMin[this.subIndex] = Math.min(this.subMin[this.subIndex], levelDb);
    this.subElapsed += blockMs;
    if (this.subElapsed >= this.subMs) {
      this.subElapsed = 0;
      this.subIndex = (this.subIndex + 1) % this.subCount;
      this.subMin[this.subIndex] = levelDb;
    }
    let floor = this.subMin[0];
    for (let index = 1; index < this.subCount; index++) {
      if (this.subMin[index] < floor) {
        floor = this.subMin[index];
      }
    }
    this.noiseFloor = floor;
  }

  updateGate(blockMs) {
    const openDb = this.noiseFloor + this.openMarginDb;
    const closeDb = this.noiseFloor + this.closeMarginDb;
    if (this.gate === 'closed') {
      if (this.detectorDb > openDb) {
        this.gate = 'open';
      }
      return;
    }
    if (this.gate === 'open') {
      if (this.detectorDb < closeDb) {
        this.gate = 'hold';
        this.holdLeft = this.holdMs;
      }
      return;
    }
    if (this.detectorDb >= closeDb) {
      this.gate = 'open';
      return;
    }
    this.holdLeft -= blockMs;
    if (this.holdLeft <= 0) {
      this.gate = 'closed';
    }
  }

  advanceEnvelope() {
    if (!this.expanderEnabled) {
      return 1;
    }
    const target = this.gate === 'closed' ? this.minGain : 1;
    const coef = target > this.envGain ? this.attackCoef : this.releaseCoef;
    this.envGain += (target - this.envGain) * coef;
    return this.envGain;
  }

  process(inputs, outputs) {
    if (this.disposed) {
      return false;
    }
    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      for (let channel = 0; channel < output.length; channel++) {
        output[channel].fill(0);
      }
      return true;
    }

    const channelCount = Math.min(input.length, output.length);
    const length = input[0].length;
    const blockMs = (length / sampleRate) * 1000;

    if (this.expanderEnabled) {
      const levelDb = this.blockLevelDb(input);
      // Seed from the first block. Ramping the detector up from silence
      // would drag the floor down, then the settled noise would look like speech.
      if (!this.detectorReady) {
        this.detectorDb = levelDb;
        this.detectorReady = true;
      } else {
        this.updateDetector(levelDb, blockMs);
      }
      this.updateFloor(this.detectorDb, blockMs);
      this.updateGate(blockMs);
    }

    if (!this.limiterEnabled) {
      if (this.expanderEnabled && this.expanderLookahead > 0) {
        this.ensureExpanderDelay(channelCount);
        for (let index = 0; index < length; index++) {
          const envGain = this.advanceEnvelope();
          for (let channel = 0; channel < channelCount; channel++) {
            const buffer = this.expanderDelay[channel];
            const delayedSample = buffer[this.expanderWriteIndex];
            buffer[this.expanderWriteIndex] = input[channel][index];
            output[channel][index] = delayedSample * envGain;
          }
          this.expanderWriteIndex += 1;
          if (this.expanderWriteIndex >= this.expanderLookahead) {
            this.expanderWriteIndex = 0;
          }
        }
        return true;
      }

      for (let index = 0; index < length; index++) {
        const envGain = this.advanceEnvelope();
        for (let channel = 0; channel < channelCount; channel++) {
          output[channel][index] = input[channel][index] * envGain;
        }
      }
      return true;
    }

    this.ensureDelay(channelCount);
    if (this.expanderEnabled && this.expanderLookahead > 0) {
      this.ensureExpanderDelay(channelCount);
    }
    for (let index = 0; index < length; index++) {
      const envGain = this.advanceEnvelope();
      let samplePeak = 0;
      for (let channel = 0; channel < channelCount; channel++) {
        let sample = input[channel][index];
        if (this.expanderEnabled && this.expanderLookahead > 0) {
          const expBuffer = this.expanderDelay[channel];
          const delayedSample = expBuffer[this.expanderWriteIndex];
          expBuffer[this.expanderWriteIndex] = sample;
          sample = delayedSample;
        }
        const buffer = this.delay[channel];
        const delayedSample = buffer[this.writeIndex];
        const next = sample * envGain;
        buffer[this.writeIndex] = next;
        this.delayed[channel] = delayedSample;
        const abs = Math.abs(next);
        if (abs > samplePeak) {
          samplePeak = abs;
        }
      }
      if (this.expanderEnabled && this.expanderLookahead > 0) {
        this.expanderWriteIndex += 1;
        if (this.expanderWriteIndex >= this.expanderLookahead) {
          this.expanderWriteIndex = 0;
        }
      }
      const peak = this.pushPeak(samplePeak);
      const desired = peak > this.ceiling ? this.ceiling / peak : 1;
      const coef =
        desired < this.limiterGain
          ? this.limiterAttackCoef
          : this.limiterReleaseCoef;
      this.limiterGain += (desired - this.limiterGain) * coef;
      for (let channel = 0; channel < channelCount; channel++) {
        output[channel][index] = this.delayed[channel] * this.limiterGain;
      }
      this.writeIndex += 1;
      if (this.writeIndex >= this.lookahead) {
        this.writeIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, VoiceDynamicsProcessor);
