import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
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
import { ensureWorkletModule } from '@core/audio/ensure-worklet-module';
import {
  DEEP_FILTER_VERSION,
  NOISE_SUPPRESSOR_VERSION,
  withVersion,
} from '@core/asset-version';
import { getStream } from '@shared/functions/get-stream.function';
import { Mutex } from 'async-mutex';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { AudioContextResumeService } from './audio-context-resume.service';
import { SettingsStore } from '@core/stores/settings.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { ENoiseProcessor } from '../../app.enums';

const deepFilterWorkletUrl = withVersion(
  'assets/deepfilternet/worklet.js',
  DEEP_FILTER_VERSION,
);
const deepFilterWasmUrl = withVersion(
  'assets/deepfilternet/df_bg.wasm',
  DEEP_FILTER_VERSION,
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

const testMutex = new Mutex();

type DenoiserNode =
  | InstanceType<NoiseSuppressorPort['RnnoiseWorkletNode']>
  | InstanceType<NoiseSuppressorPort['DeepFilterWorkletNode']>;

/**
 * Isolated microphone test pipeline for settings/preview.
 * Creates its own AudioContext and streams to the selected output sink.
 */
@Injectable({ providedIn: 'root' })
export class MicTestService {
  private readonly noiseSuppressor = inject(NOISE_SUPPRESSOR_PORT);
  private readonly audioContextResumeService = inject(
    AudioContextResumeService,
  );
  private readonly settingsStore = inject(SettingsStore);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _isRunning = signal(false);
  public readonly isRunning = this._isRunning.asReadonly();

  private readonly _level = signal(0);
  /** Audio level 0..100 */
  public readonly level = this._level.asReadonly();

  private readonly _isSinkIdSupported = signal(
    typeof window !== 'undefined' &&
      typeof AudioContext !== 'undefined' &&
      'setSinkId' in AudioContext.prototype,
  );
  public readonly isSinkIdSupported = this._isSinkIdSupported.asReadonly();

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
  private analyserNode: AnalyserNode | null = null;

  private deepFilterModule: WebAssembly.Module | null = null;
  private rnnoiseWasmBinary: ArrayBuffer | null = null;
  private dynamicsReady = false;
  private rafId: number | null = null;
  private currentInputDevice: MediaDeviceInfo | null = null;
  private currentOutputDevice: MediaDeviceInfo | null = null;

  private readonly onVisibilityChange = (): void => {
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden' &&
      this._isRunning()
    ) {
      void this.stop();
    }
  };

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    effect(() => {
      const activeSession = this.voiceSessionStore.activeSession();
      const isRunning = this._isRunning();
      if (activeSession && isRunning) {
        void this.stop();
      }
    });

    effect(() => {
      const gain = this.settingsStore.inputGain();
      const isRunning = this._isRunning();
      if (isRunning && this.gainNode) {
        this.gainNode.gain.value = gain;
      }
    });

    this.destroyRef.onDestroy(() => {
      if (typeof document !== 'undefined') {
        document.removeEventListener(
          'visibilitychange',
          this.onVisibilityChange,
        );
      }
      void this.stop();
    });
  }

  @Mutexed(testMutex)
  public async start(
    inputDevice: MediaDeviceInfo | null,
    outputDevice: MediaDeviceInfo | null,
  ): Promise<void> {
    await this.startInternal(inputDevice, outputDevice);
  }

  @Mutexed(testMutex)
  public async stop(): Promise<void> {
    await this.stopInternal();
  }

  @Mutexed(testMutex)
  public async restart(
    inputDevice: MediaDeviceInfo | null = this.currentInputDevice,
    outputDevice: MediaDeviceInfo | null = this.currentOutputDevice,
  ): Promise<void> {
    if (!this._isRunning()) {
      return;
    }
    await this.stopInternal();
    await this.startInternal(inputDevice, outputDevice);
  }

  public setGain(value: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = value;
    }
  }

  private async startInternal(
    inputDevice: MediaDeviceInfo | null,
    outputDevice: MediaDeviceInfo | null,
  ): Promise<void> {
    if (this.voiceSessionStore.activeSession()) {
      return;
    }

    this.currentInputDevice = inputDevice;
    this.currentOutputDevice = outputDevice;

    try {
      await this.ensureContext();
      await this.applySink(outputDevice);
      await this.ensureDynamics();
      await this.buildPipeline(inputDevice);
      this._isRunning.set(true);
      this.startMetering();
    } catch (error) {
      await this.stopInternal();
      throw error;
    }
  }

  private async stopInternal(): Promise<void> {
    this.stopMetering();
    this.cleanupPipeline();
    this.cleanupInputStream();

    if (this.context && this.context.state !== 'closed') {
      try {
        this.audioContextResumeService.unregister(this.context);
        await this.context.close();
      } catch (error) {
        console.warn('Failed to close mic test audio context', error);
      }
    }

    this.context = null;
    this.dynamicsReady = false;
    this._isRunning.set(false);
    this._level.set(0);
  }

  private async ensureContext(): Promise<void> {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext({ sampleRate: 48000 });
      this.dynamicsReady = false;
      this.audioContextResumeService.register(this.context);
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  private async applySink(device: MediaDeviceInfo | null): Promise<void> {
    if (
      this.context &&
      'setSinkId' in this.context &&
      typeof this.context.setSinkId === 'function'
    ) {
      try {
        if (device?.deviceId) {
          await this.context.setSinkId(device.deviceId);
        } else {
          await this.context.setSinkId('default');
        }
        this._isSinkIdSupported.set(true);
      } catch {
        this._isSinkIdSupported.set(false);
      }
    } else {
      this._isSinkIdSupported.set(false);
    }
  }

  private async ensureDynamics(): Promise<void> {
    if (!this.context) {
      return;
    }
    try {
      await ensureVoiceDynamicsWorklet(this.context);
      this.dynamicsReady = true;
    } catch {
      this.dynamicsReady = false;
    }
  }

  private async buildPipeline(device: MediaDeviceInfo | null): Promise<void> {
    if (!this.context) {
      return;
    }

    const preferredProcessor = this.settingsStore.noiseProcessor();
    const echoCancellation = this.settingsStore.echoCancellation();
    const inputGain = this.settingsStore.inputGain();

    this.inputStream = await getStream(device, {
      echoCancellation,
      noiseSuppression: preferredProcessor === ENoiseProcessor.BROWSER,
    });

    this.sourceNode = this.context.createMediaStreamSource(this.inputStream);

    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = inputGain;

    this.biquadNode = this.context.createBiquadFilter();
    this.biquadNode.type = 'highpass';
    this.biquadNode.frequency.value = VOICE_CAPTURE.highpassHz;
    this.biquadNode.Q.value = VOICE_CAPTURE.highpassQ;

    const resolvedProcessor = await this.resolveProcessor(preferredProcessor);
    if (
      resolvedProcessor === ENoiseProcessor.DEEPFILTER ||
      resolvedProcessor === ENoiseProcessor.RNNOISE
    ) {
      try {
        this.denoiserNode = await this.createDenoiser(resolvedProcessor);
      } catch (error) {
        console.warn('Failed to construct mic test denoiser node', error);
        this.denoiserNode = null;
      }
    }

    this.compressorNode = this.context.createDynamicsCompressor();
    this.compressorNode.threshold.value = VOICE_CAPTURE.compressor.threshold;
    this.compressorNode.knee.value = VOICE_CAPTURE.compressor.knee;
    this.compressorNode.ratio.value = VOICE_CAPTURE.compressor.ratio;
    this.compressorNode.attack.value = VOICE_CAPTURE.compressor.attack;
    this.compressorNode.release.value = VOICE_CAPTURE.compressor.release;

    if (this.dynamicsReady) {
      try {
        this.expanderNode = createVoiceDynamicsNode(this.context, 'expander');
        this.limiterNode = createVoiceDynamicsNode(this.context, 'limiter');
        this.makeupNode = this.context.createGain();
        this.makeupNode.gain.value = VOICE_MAKEUP_GAIN;
      } catch {
        if (this.expanderNode) disposeVoiceDynamicsNode(this.expanderNode);
        if (this.limiterNode) disposeVoiceDynamicsNode(this.limiterNode);
        this.expanderNode = null;
        this.limiterNode = null;
        this.makeupNode = null;
      }
    }

    this.analyserNode = this.context.createAnalyser();
    this.analyserNode.fftSize = 128;
    this.analyserNode.smoothingTimeConstant = 0.2;

    const chain: AudioNode[] = [
      this.sourceNode,
      this.gainNode,
      this.biquadNode,
    ];
    if (this.denoiserNode) {
      chain.push(this.denoiserNode);
    }
    if (this.expanderNode) {
      chain.push(this.expanderNode);
    }
    chain.push(this.compressorNode);
    if (this.makeupNode) {
      chain.push(this.makeupNode);
    }
    if (this.limiterNode) {
      chain.push(this.limiterNode);
    }

    for (let i = 0; i < chain.length - 1; i++) {
      chain[i].connect(chain[i + 1]);
    }

    const tail = chain[chain.length - 1];
    tail.connect(this.analyserNode);
    tail.connect(this.context.destination);
  }

  private async resolveProcessor(
    preferred: ENoiseProcessor,
  ): Promise<ENoiseProcessor> {
    if (
      preferred === ENoiseProcessor.BROWSER ||
      preferred === ENoiseProcessor.OFF
    ) {
      return preferred;
    }

    if (preferred === ENoiseProcessor.DEEPFILTER) {
      const isSimd = this.noiseSuppressor.isSimdSupported();
      const is48k = this.context?.sampleRate === 48000;
      if (isSimd && is48k) {
        if (!this.context) {
          return ENoiseProcessor.OFF;
        }
        try {
          if (!this.deepFilterModule) {
            this.deepFilterModule = await this.noiseSuppressor.loadDeepFilter({
              url: deepFilterWasmUrl,
            });
          }
          await ensureWorkletModule(this.context, deepFilterWorkletUrl);
          return ENoiseProcessor.DEEPFILTER;
        } catch {
          // Fall back to RNNoise
        }
      }
    }

    if (this.context && this.context.sampleRate === 48000) {
      try {
        if (!this.rnnoiseWasmBinary) {
          this.rnnoiseWasmBinary = await this.noiseSuppressor.loadRnnoise({
            url: rnnoiseWasmUrl,
            simdUrl: rnnoiseSimdWasmUrl,
          });
        }
        await ensureWorkletModule(this.context, rnnoiseWorkletUrl);
        return ENoiseProcessor.RNNOISE;
      } catch {
        return ENoiseProcessor.OFF;
      }
    }

    return ENoiseProcessor.OFF;
  }

  private async createDenoiser(
    processor: ENoiseProcessor,
  ): Promise<DenoiserNode> {
    if (!this.context) {
      throw new Error('missing context');
    }
    if (processor === ENoiseProcessor.DEEPFILTER && this.deepFilterModule) {
      return new this.noiseSuppressor.DeepFilterWorkletNode(this.context, {
        wasmModule: this.deepFilterModule,
      });
    }
    if (!this.rnnoiseWasmBinary) {
      throw new Error('missing rnnoise binary');
    }
    return new this.noiseSuppressor.RnnoiseWorkletNode(this.context, {
      wasmBinary: this.rnnoiseWasmBinary,
      maxChannels: 1,
    });
  }

  private startMetering(): void {
    if (typeof window === 'undefined' || !this.analyserNode) {
      return;
    }
    const analyser = this.analyserNode;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateMeter = (): void => {
      if (!this._isRunning()) {
        this._level.set(0);
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      const normalized = Math.min(100, Math.round((average / 128) * 100));
      this._level.set(normalized);
      this.rafId = requestAnimationFrame(updateMeter);
    };

    this.rafId = requestAnimationFrame(updateMeter);
  }

  private stopMetering(): void {
    if (this.rafId !== null && typeof window !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this._level.set(0);
  }

  private cleanupInputStream(): void {
    this.inputStream?.getTracks().forEach((track) => track.stop());
    this.inputStream = null;
  }

  private cleanupPipeline(): void {
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
      this.analyserNode?.disconnect();
    } catch {
      // Disconnect error ignored
    } finally {
      this.sourceNode = null;
      this.gainNode = null;
      this.biquadNode = null;
      this.denoiserNode = null;
      this.expanderNode = null;
      this.compressorNode = null;
      this.makeupNode = null;
      this.limiterNode = null;
      this.analyserNode = null;
    }
  }
}
