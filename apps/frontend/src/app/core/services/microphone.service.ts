import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import {
  NOISE_SUPPRESSOR_PORT,
  type NoiseSuppressorPort,
} from '@core/audio/noise-suppressor.port';
import {
  VOICE_CAPTURE,
  VOICE_MAKEUP_GAIN,
  createVoiceDynamicsNode,
  disposeVoiceDynamicsNode,
  ensureVoiceDynamicsWorklet,
} from '@core/audio/voice-dynamics';
import { NOISE_SUPPRESSOR_VERSION, withVersion } from '@core/asset-version';
import { getStream } from '@shared/functions/get-stream.function';
import { Mutex } from 'async-mutex';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { AudioContextResumeService } from './audio-context-resume.service';

const speexWorkletUrl = withVersion(
  'assets/web-noise-suppressor/speex/workletProcessor.js',
  NOISE_SUPPRESSOR_VERSION,
);
const speexWasmUrl = withVersion(
  'assets/web-noise-suppressor/speex.wasm',
  NOISE_SUPPRESSOR_VERSION,
);
const rnnoiseWorkletUrl = withVersion(
  'assets/web-noise-suppressor/rnnoise/workletProcessor.js',
  NOISE_SUPPRESSOR_VERSION,
);
const rnnoiseWasmUrl = withVersion(
  'assets/web-noise-suppressor/rnnoise.wasm',
  NOISE_SUPPRESSOR_VERSION,
);
const rnnoiseSimdWasmUrl = withVersion(
  'assets/web-noise-suppressor/rnnoise_simd.wasm',
  NOISE_SUPPRESSOR_VERSION,
);

const publicMethodsMutex = new Mutex();

type DenoiserKind = 'rnnoise' | 'speex';
type DenoiserNode =
  | InstanceType<NoiseSuppressorPort['RnnoiseWorkletNode']>
  | InstanceType<NoiseSuppressorPort['SpeexWorkletNode']>;

/**
 * Local capture pipeline: device stream, gain, highpass, RNNoise (Speex fallback),
 * expander, compressor, makeup, limiter, analyser, processed MediaStream.
 */
@Injectable({ providedIn: 'root' })
export class MicrophoneService implements OnDestroy {
  private readonly noiseSuppressor = inject(NOISE_SUPPRESSOR_PORT);
  private readonly audioContextResumeService = inject(
    AudioContextResumeService,
  );
  private context: AudioContext | null = null;

  private inputStream: MediaStream | null = null;

  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private biquadNode: BiquadFilterNode | null = null;
  private denoiserNode: DenoiserNode | null = null;
  private expanderNode: AudioWorkletNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private makeupNode: GainNode | null = null;
  private limiterNode: AudioWorkletNode | null = null;
  private readonly _analyserNode = signal<AnalyserNode | null>(null);
  /**
   * Microphone analyser node
   */
  public readonly analyserNode = this._analyserNode.asReadonly();
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  private rnnoiseWasmBinary: ArrayBuffer | null = null;
  private speexWasmBinary: ArrayBuffer | null = null;
  private rnnoiseWorklet: Promise<void> | null = null;
  private speexWorklet: Promise<void> | null = null;
  private denoiserKind: DenoiserKind | null = null;
  private dynamicsReady = false;

  private device: MediaDeviceInfo | null = null;
  private gain = 1;

  private readonly _processedStream = signal<MediaStream | null>(null);
  public readonly processedStream = this._processedStream.asReadonly();

  private readonly onDeviceChange = (): void => {
    void this.handleDeviceChange();
  };

  constructor() {
    navigator.mediaDevices?.addEventListener(
      'devicechange',
      this.onDeviceChange,
    );
  }

  ngOnDestroy(): void {
    navigator.mediaDevices?.removeEventListener(
      'devicechange',
      this.onDeviceChange,
    );
  }

  /**
   * iOS/Safari fires `devicechange` after the first mic permission even when
   * hardware did not change. Recreating capture then stops the track already
   * given to mediasoup (local VAD still works on the new analyser).
   */
  private async handleDeviceChange(): Promise<void> {
    if (!this.processedStream()) {
      return;
    }

    if (!this.device) {
      return;
    }

    const devices = (await navigator.mediaDevices.enumerateDevices?.()) ?? [];
    const selectedStillPresent = devices.some(
      (item) =>
        item.kind === 'audioinput' && item.deviceId === this.device?.deviceId,
    );
    if (!selectedStillPresent) {
      await this.setDevice(null);
    }
  }

  /**
   * Set input device (microphone)
   *
   * If pipeline active, recreate it
   * @param device
   */
  @Mutexed(publicMethodsMutex)
  public async setDevice(device: MediaDeviceInfo | null) {
    this.device = device;

    const recreate = !!this.processedStream();

    this.cleanupPipeline();
    this.cleanupInputStream();

    if (recreate) {
      await this.ensureInputStream(device);
      await this.ensurePipeline();
    }
  }

  /**
   * Set microphone gain (volume)
   * @param value
   */
  public setGain(value: number): void {
    this.gain = value;
    if (this.gainNode) {
      this.gainNode.gain.value = value;
    }
  }

  /**
   * Get stream processed with the audio context
   * @returns
   */
  @Mutexed(publicMethodsMutex)
  public async getStream(): Promise<MediaStream> {
    const processedStream = this.processedStream();
    if (processedStream) {
      const track = processedStream.getAudioTracks()[0];
      if (track && track.readyState === 'live') {
        return processedStream;
      }

      console.warn('Processed stream dead, recreating...');
      this.cleanupPipeline();
      this.cleanupInputStream();
    }

    await this.ensureContext();
    await this.resolveDenoiser();
    await this.ensureDynamics();
    await this.ensureInputStream(this.device);
    await this.ensurePipeline();
    return this.processedStream() as MediaStream;
  }

  @Mutexed(publicMethodsMutex)
  public async release(): Promise<void> {
    this.cleanupPipeline();
    this.cleanupInputStream();

    if (this.context && this.context.state !== 'closed') {
      try {
        this.audioContextResumeService.unregister(this.context);
        await this.context.close();
      } catch (error) {
        console.warn('Failed to close microphone context', error);
      }
    }

    this.context = null;
    this._analyserNode.set(null);
    this.rnnoiseWorklet = null;
    this.speexWorklet = null;
    this.rnnoiseWasmBinary = null;
    this.speexWasmBinary = null;
    this.denoiserKind = null;
    this.dynamicsReady = false;
  }

  private async ensureContext() {
    if (!this.context || this.context.state === 'closed') {
      if (this.context) {
        this.audioContextResumeService.unregister(this.context);
      }
      this.context = new AudioContext({ sampleRate: 48000 });
      this.rnnoiseWorklet = null;
      this.speexWorklet = null;
      this.dynamicsReady = false;
      this.audioContextResumeService.register(this.context);
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  /**
   * RNNoise needs 48 kHz. Anything else, or a failed wasm load, stays on Speex.
   */
  private async resolveDenoiser(): Promise<void> {
    if (!this.context) {
      console.warn('resolveDenoiser(): missing context');
      return;
    }

    if (this.context.sampleRate === 48000) {
      try {
        await this.ensureRnnoise();
        this.denoiserKind = 'rnnoise';
        return;
      } catch (error) {
        console.warn('RNNoise unavailable, using Speex', error);
      }
    } else {
      console.warn(
        `AudioContext sample rate is ${this.context.sampleRate}, using Speex`,
      );
    }

    await this.ensureSpeex();
    this.denoiserKind = 'speex';
  }

  private async ensureRnnoise(): Promise<void> {
    if (!this.rnnoiseWasmBinary) {
      this.rnnoiseWasmBinary = await this.noiseSuppressor.loadRnnoise({
        url: rnnoiseWasmUrl,
        simdUrl: rnnoiseSimdWasmUrl,
      });
    }
    await this.ensureWorklet(rnnoiseWorkletUrl, 'rnnoise');
  }

  private async ensureSpeex(): Promise<void> {
    if (!this.speexWasmBinary) {
      this.speexWasmBinary = await this.noiseSuppressor.loadSpeex({
        url: speexWasmUrl,
      });
    }
    await this.ensureWorklet(speexWorkletUrl, 'speex');
  }

  private async ensureWorklet(url: string, kind: DenoiserKind): Promise<void> {
    if (!this.context) {
      throw new Error('ensureWorklet(): missing context');
    }
    const current =
      kind === 'rnnoise' ? this.rnnoiseWorklet : this.speexWorklet;
    if (current) {
      await current;
      return;
    }
    const loading = this.context.audioWorklet.addModule(url);
    if (kind === 'rnnoise') {
      this.rnnoiseWorklet = loading;
    } else {
      this.speexWorklet = loading;
    }
    try {
      await loading;
    } catch (error) {
      if (kind === 'rnnoise') {
        this.rnnoiseWorklet = null;
      } else {
        this.speexWorklet = null;
      }
      throw error;
    }
  }

  private async ensureDynamics(): Promise<void> {
    if (!this.context) {
      console.warn('ensureDynamics(): missing context');
      return;
    }
    try {
      await ensureVoiceDynamicsWorklet(this.context);
      this.dynamicsReady = true;
    } catch (error) {
      console.warn('Voice dynamics worklet failed to load', error);
      this.dynamicsReady = false;
    }
  }

  /**
   * Ensure input stream ready
   * @param device
   * @returns
   */
  private async ensureInputStream(device: MediaDeviceInfo | null) {
    const track = this.inputStream?.getAudioTracks()?.[0];
    if (track && track.readyState === 'live') {
      return;
    }

    this.inputStream = await getStream(device);
  }

  /**
   * Ensure audio context nodes ready
   * @returns
   */
  private async ensurePipeline() {
    this.cleanupPipeline();

    if (!this.context) {
      console.warn('ensureNodes(): context is not ready');
      return;
    }
    if (!this.inputStream) {
      console.warn('ensureNodes(): inputStream is not ready');
      return;
    }
    if (!this.denoiserKind) {
      console.warn('ensureNodes(): denoiser is not ready');
      return;
    }

    try {
      this.sourceNode = this.context.createMediaStreamSource(this.inputStream);

      this.gainNode = this.context.createGain();
      this.gainNode.gain.value = this.gain;

      this.biquadNode = this.context.createBiquadFilter();
      this.biquadNode.type = 'highpass';
      this.biquadNode.frequency.value = VOICE_CAPTURE.highpassHz;
      this.biquadNode.Q.value = VOICE_CAPTURE.highpassQ;

      this.denoiserNode = this.createDenoiser();

      this.compressorNode = this.context.createDynamicsCompressor();
      this.compressorNode.threshold.value = VOICE_CAPTURE.compressor.threshold;
      this.compressorNode.knee.value = VOICE_CAPTURE.compressor.knee;
      this.compressorNode.ratio.value = VOICE_CAPTURE.compressor.ratio;
      this.compressorNode.attack.value = VOICE_CAPTURE.compressor.attack;
      this.compressorNode.release.value = VOICE_CAPTURE.compressor.release;

      this.makeupNode = this.context.createGain();
      this.makeupNode.gain.value = this.dynamicsReady ? VOICE_MAKEUP_GAIN : 1;

      if (this.dynamicsReady) {
        try {
          this.expanderNode = createVoiceDynamicsNode(this.context, 'expander');
          this.limiterNode = createVoiceDynamicsNode(this.context, 'limiter');
        } catch (error) {
          console.warn('Voice dynamics nodes unavailable', error);
          if (this.expanderNode) {
            disposeVoiceDynamicsNode(this.expanderNode);
          }
          if (this.limiterNode) {
            disposeVoiceDynamicsNode(this.limiterNode);
          }
          this.expanderNode = null;
          this.limiterNode = null;
          this.makeupNode.gain.value = 1;
        }
      }

      const analyserNode = this.context.createAnalyser();
      analyserNode.fftSize = 128;
      analyserNode.smoothingTimeConstant = 0.2;

      this.destinationNode = this.context.createMediaStreamDestination();

      const chain: AudioNode[] = [
        this.sourceNode,
        this.gainNode,
        this.biquadNode,
        this.denoiserNode,
      ];
      if (this.expanderNode) {
        chain.push(this.expanderNode);
      }
      chain.push(this.compressorNode, this.makeupNode);
      if (this.limiterNode) {
        chain.push(this.limiterNode);
      }
      this.connectSeries(chain);

      const tail = chain[chain.length - 1];
      tail.connect(analyserNode);
      tail.connect(this.destinationNode);

      this._analyserNode.set(analyserNode);
      this._processedStream.set(this.destinationNode.stream);
    } catch (error) {
      this.cleanupPipeline();
      throw error;
    }
  }

  private createDenoiser(): DenoiserNode {
    if (!this.context) {
      throw new Error('createDenoiser(): missing context');
    }
    if (this.denoiserKind === 'rnnoise') {
      if (!this.rnnoiseWasmBinary) {
        throw new Error('createDenoiser(): missing RNNoise wasm');
      }
      return new this.noiseSuppressor.RnnoiseWorkletNode(this.context, {
        wasmBinary: this.rnnoiseWasmBinary,
        maxChannels: 1,
      });
    }
    if (!this.speexWasmBinary) {
      throw new Error('createDenoiser(): missing Speex wasm');
    }
    return new this.noiseSuppressor.SpeexWorkletNode(this.context, {
      wasmBinary: this.speexWasmBinary,
      maxChannels: 1,
    });
  }

  private connectSeries(nodes: AudioNode[]): void {
    for (let index = 0; index < nodes.length - 1; index++) {
      nodes[index].connect(nodes[index + 1]);
    }
  }

  private cleanupInputStream() {
    const tracks = new Set<MediaStreamTrack>();
    this.inputStream?.getAudioTracks().forEach((track) => tracks.add(track));
    this.processedStream()
      ?.getAudioTracks()
      .forEach((track) => tracks.add(track));

    tracks.forEach((track) => track.stop());
    this.inputStream = null;
  }

  private cleanupPipeline() {
    try {
      this.sourceNode?.disconnect();
      this.gainNode?.disconnect();
      this.biquadNode?.disconnect();
      this.denoiserNode?.disconnect();
      this.denoiserNode?.destroy();
      if (this.expanderNode) {
        disposeVoiceDynamicsNode(this.expanderNode);
      }
      this.compressorNode?.disconnect();
      this.makeupNode?.disconnect();
      if (this.limiterNode) {
        disposeVoiceDynamicsNode(this.limiterNode);
      }
      this._analyserNode()?.disconnect();
      this.destinationNode?.disconnect();
    } catch (error) {
      console.error(error);
    } finally {
      this.sourceNode = null;
      this.gainNode = null;
      this.biquadNode = null;
      this.denoiserNode = null;
      this.expanderNode = null;
      this.compressorNode = null;
      this.makeupNode = null;
      this.limiterNode = null;
      this.destinationNode = null;
      this._analyserNode.set(null);
      this._processedStream.set(null);
    }
  }
}
