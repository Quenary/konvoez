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
import { ENoiseProcessor } from '../../app.enums';
import { TuiNotificationService } from '@taiga-ui/core';
import { TranslateService } from '@ngx-translate/core';

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

const publicMethodsMutex = new Mutex();

type DenoiserNode =
  | InstanceType<NoiseSuppressorPort['RnnoiseWorkletNode']>
  | InstanceType<NoiseSuppressorPort['DeepFilterWorkletNode']>;

/**
 * Local capture pipeline: device stream, gain, highpass, denoiser (DeepFilterNet3 / RNNoise / pass-through),
 * expander, compressor, makeup, limiter, analyser, processed MediaStream.
 */
@Injectable({ providedIn: 'root' })
export class MicrophoneService implements OnDestroy {
  private readonly noiseSuppressor = inject(NOISE_SUPPRESSOR_PORT);
  private readonly audioContextResumeService = inject(
    AudioContextResumeService,
  );
  private readonly tuiNotificationService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  private readonly _analyserNode = signal<AnalyserNode | null>(null);
  /** Microphone analyser node */
  public readonly analyserNode = this._analyserNode.asReadonly();

  private readonly _processedStream = signal<MediaStream | null>(null);
  public readonly processedStream = this._processedStream.asReadonly();

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
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  private deepFilterModule: WebAssembly.Module | null = null;
  private rnnoiseWasmBinary: ArrayBuffer | null = null;
  private processorPreference: ENoiseProcessor = ENoiseProcessor.DEEPFILTER;
  private activeProcessor: ENoiseProcessor = ENoiseProcessor.DEEPFILTER;
  private echoCancellationPreference = true;
  private dynamicsReady = false;
  private hasNotifiedCpuOverload = false;

  private device: MediaDeviceInfo | null = null;
  private gain = 1;

  private readonly onDeviceChange = (): void => {
    void this.handleDeviceChange();
  };

  constructor() {
    if (typeof navigator.mediaDevices?.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener(
        'devicechange',
        this.onDeviceChange,
      );
    }
  }

  ngOnDestroy(): void {
    if (typeof navigator.mediaDevices?.removeEventListener === 'function') {
      navigator.mediaDevices.removeEventListener(
        'devicechange',
        this.onDeviceChange,
      );
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
   * Set active noise processor preference.
   * If capture pipeline is running, dynamically switches denoiser without recreating destination track.
   */
  @Mutexed(publicMethodsMutex)
  public async setProcessor(processor: ENoiseProcessor): Promise<void> {
    this.processorPreference = processor;
    if (!this.processedStream()) {
      return;
    }
    await this.applyProcessor(processor);
  }

  /**
   * Set echo cancellation toggle.
   * If capture pipeline is running, re-acquires device stream without recreating destination track.
   */
  @Mutexed(publicMethodsMutex)
  public async setEchoCancellation(enabled: boolean): Promise<void> {
    this.echoCancellationPreference = enabled;
    if (!this.processedStream()) {
      return;
    }
    await this.reacquireInputStream();
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
    this.activeProcessor = await this.resolveDenoiserKind(
      this.processorPreference,
    );
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
    this.deepFilterModule = null;
    this.rnnoiseWasmBinary = null;
    this.activeProcessor = this.processorPreference;
    this.dynamicsReady = false;
    this.hasNotifiedCpuOverload = false;
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

  private async ensureContext() {
    if (!this.context || this.context.state === 'closed') {
      if (this.context) {
        this.audioContextResumeService.unregister(this.context);
      }
      this.context = new AudioContext({ sampleRate: 48000 });
      this.dynamicsReady = false;
      this.audioContextResumeService.register(this.context);
      this.setupRenderCapacityListener();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  private setupRenderCapacityListener(): void {
    const ctx = this.context as
      | (AudioContext & {
          renderCapacity?: {
            start: (options?: { updateInterval?: number }) => void;
            addEventListener: (
              type: string,
              listener: (ev: { averageLoad: number }) => void,
            ) => void;
          };
        })
      | null;

    if (ctx && 'renderCapacity' in ctx && ctx.renderCapacity) {
      try {
        ctx.renderCapacity.start({ updateInterval: 0.5 });
        let highLoadCount = 0;
        ctx.renderCapacity.addEventListener('update', (ev) => {
          if (this.activeProcessor === ENoiseProcessor.DEEPFILTER) {
            if (ev.averageLoad > 0.85) {
              highLoadCount++;
              if (highLoadCount >= 4) {
                void this.handleCpuOverload();
              }
            } else {
              highLoadCount = 0;
            }
          }
        });
      } catch {
        // renderCapacity optional
      }
    }
  }

  private async handleCpuOverload(): Promise<void> {
    if (this.activeProcessor !== ENoiseProcessor.DEEPFILTER) {
      return;
    }
    console.warn(
      'DeepFilterNet CPU overload detected; falling back to RNNoise for session',
    );
    await this.applyProcessor(ENoiseProcessor.RNNOISE);
    if (!this.hasNotifiedCpuOverload) {
      this.hasNotifiedCpuOverload = true;
      this.tuiNotificationService
        .open(
          this.translateService.instant(
            'SETTINGS.DEVICES.PROCESSOR_OVERLOAD_NOTIFICATION',
          ),
          {
            appearance: 'warning',
            autoClose: 5000,
            closable: true,
          },
        )
        .subscribe();
    }
  }

  /**
   * Resolves the requested denoiser against capabilities, falling back gracefully:
   * DFN3 -> RNNoise -> off.
   */
  private async resolveDenoiserKind(
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
        try {
          await this.ensureDeepFilter();
          return ENoiseProcessor.DEEPFILTER;
        } catch (error) {
          console.warn(
            'DeepFilterNet load failed, falling back to RNNoise',
            error,
          );
        }
      } else {
        console.warn(
          `DeepFilterNet unsupported (SIMD: ${isSimd}, sampleRate: ${this.context?.sampleRate}); falling back to RNNoise`,
        );
      }
    }

    if (this.context?.sampleRate === 48000) {
      try {
        await this.ensureRnnoise();
        return ENoiseProcessor.RNNOISE;
      } catch (error) {
        console.warn('RNNoise load failed, falling back to off', error);
      }
    } else {
      console.warn('RNNoise requires 48 kHz, falling back to off');
    }

    return ENoiseProcessor.OFF;
  }

  private async ensureDeepFilter(): Promise<void> {
    if (!this.deepFilterModule) {
      this.deepFilterModule = await this.noiseSuppressor.loadDeepFilter({
        url: deepFilterWasmUrl,
      });
    }
    await this.ensureWorklet(deepFilterWorkletUrl);
  }

  private async ensureRnnoise(): Promise<void> {
    if (!this.rnnoiseWasmBinary) {
      this.rnnoiseWasmBinary = await this.noiseSuppressor.loadRnnoise({
        url: rnnoiseWasmUrl,
        simdUrl: rnnoiseSimdWasmUrl,
      });
    }
    await this.ensureWorklet(rnnoiseWorkletUrl);
  }

  private async ensureWorklet(url: string): Promise<void> {
    if (!this.context) {
      throw new Error('ensureWorklet(): missing context');
    }
    await ensureWorkletModule(this.context, url);
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

  private async ensureInputStream(device: MediaDeviceInfo | null) {
    const track = this.inputStream?.getAudioTracks()?.[0];
    if (track && track.readyState === 'live') {
      return;
    }

    this.inputStream = await getStream(device, {
      echoCancellation: this.echoCancellationPreference,
      noiseSuppression: this.activeProcessor === ENoiseProcessor.BROWSER,
    });
  }

  private async reacquireInputStream(): Promise<void> {
    if (!this.context || !this.sourceNode || !this.gainNode) {
      return;
    }

    const previousStream = this.inputStream;
    this.inputStream = await getStream(this.device, {
      echoCancellation: this.echoCancellationPreference,
      noiseSuppression: this.activeProcessor === ENoiseProcessor.BROWSER,
    });
    previousStream?.getTracks().forEach((track) => track.stop());

    this.sourceNode.disconnect();
    this.sourceNode = this.context.createMediaStreamSource(this.inputStream);
    this.sourceNode.connect(this.gainNode);
  }

  private async applyProcessor(target: ENoiseProcessor): Promise<void> {
    const resolved = await this.resolveDenoiserKind(target);
    const prevProcessor = this.activeProcessor;
    this.activeProcessor = resolved;

    if (!this.context || !this.biquadNode) {
      return;
    }

    const needsReacquire =
      (prevProcessor === ENoiseProcessor.BROWSER &&
        resolved !== ENoiseProcessor.BROWSER) ||
      (prevProcessor !== ENoiseProcessor.BROWSER &&
        resolved === ENoiseProcessor.BROWSER);

    if (needsReacquire) {
      await this.reacquireInputStream();
    }

    const nextNode: AudioNode | null = this.expanderNode ?? this.compressorNode;
    if (!nextNode) {
      return;
    }

    this.biquadNode.disconnect();
    if (this.denoiserNode) {
      this.denoiserNode.disconnect();
      this.denoiserNode.destroy();
      this.denoiserNode = null;
    }

    if (
      resolved === ENoiseProcessor.DEEPFILTER ||
      resolved === ENoiseProcessor.RNNOISE
    ) {
      try {
        this.denoiserNode = this.createDenoiserNode(resolved);
        this.biquadNode.connect(this.denoiserNode);
        this.denoiserNode.connect(nextNode);
      } catch (error) {
        console.warn(
          'Failed to construct denoiser node during applyProcessor',
          error,
        );
        this.denoiserNode = null;
        this.activeProcessor = ENoiseProcessor.OFF;
        this.biquadNode.connect(nextNode);
      }
    } else {
      this.biquadNode.connect(nextNode);
    }
  }

  /**
   * Ensure audio context nodes ready
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

    try {
      this.sourceNode = this.context.createMediaStreamSource(this.inputStream);

      this.gainNode = this.context.createGain();
      this.gainNode.gain.value = this.gain;

      this.biquadNode = this.context.createBiquadFilter();
      this.biquadNode.type = 'highpass';
      this.biquadNode.frequency.value = VOICE_CAPTURE.highpassHz;
      this.biquadNode.Q.value = VOICE_CAPTURE.highpassQ;

      if (
        this.activeProcessor === ENoiseProcessor.DEEPFILTER ||
        this.activeProcessor === ENoiseProcessor.RNNOISE
      ) {
        try {
          this.denoiserNode = this.createDenoiserNode(this.activeProcessor);
        } catch (error) {
          console.warn(
            'Failed to construct denoiser node, falling back',
            error,
          );
          if (this.activeProcessor === ENoiseProcessor.DEEPFILTER) {
            try {
              await this.ensureRnnoise();
              this.activeProcessor = ENoiseProcessor.RNNOISE;
              this.denoiserNode = this.createDenoiserNode(
                ENoiseProcessor.RNNOISE,
              );
            } catch (fallbackError) {
              console.warn(
                'RNNoise fallback failed, disabling noise suppression',
                fallbackError,
              );
              this.activeProcessor = ENoiseProcessor.OFF;
              this.denoiserNode = null;
            }
          } else {
            this.activeProcessor = ENoiseProcessor.OFF;
            this.denoiserNode = null;
          }
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
          this.makeupNode = null;
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

  private createDenoiserNode(processor: ENoiseProcessor): DenoiserNode {
    if (!this.context) {
      throw new Error('createDenoiserNode(): missing context');
    }
    if (processor === ENoiseProcessor.DEEPFILTER) {
      if (!this.deepFilterModule) {
        throw new Error('createDenoiserNode(): missing DeepFilterNet module');
      }
      return new this.noiseSuppressor.DeepFilterWorkletNode(this.context, {
        wasmModule: this.deepFilterModule,
      });
    }
    if (!this.rnnoiseWasmBinary) {
      throw new Error('createDenoiserNode(): missing RNNoise wasm');
    }
    return new this.noiseSuppressor.RnnoiseWorkletNode(this.context, {
      wasmBinary: this.rnnoiseWasmBinary,
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
