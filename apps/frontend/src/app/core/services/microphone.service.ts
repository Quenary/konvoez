import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NOISE_SUPPRESSOR_PORT } from '@core/audio/noise-suppressor.port';
import { ensureVoiceDynamicsWorklet } from '@core/audio/voice-dynamics';
import {
  type TCaptureGraph,
  type TCaptureWasmCache,
  buildCaptureGraph,
  disposeCaptureGraph,
  resolveDenoiser,
  swapDenoiser,
} from '@core/audio/capture-graph';
import { getStream } from '@shared/functions/get-stream.function';
import { resolveMediaDevice } from '@shared/functions/media-device-priority.function';
import { DEFAULT_ECHO_CANCELLATION } from '@shared/schemas/local-settings.schema';
import { Mutex } from 'async-mutex';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { AudioContextResumeService } from './audio-context-resume.service';
import { MediaDevicesService } from './media-devices.service';
import { MediaDeviceSwitchNotifierService } from './media-device-switch-notifier.service';
import { ENoiseProcessor } from '../../app.enums';
import { TuiNotificationService } from '@taiga-ui/core';
import { TranslateService } from '@ngx-translate/core';

const publicMethodsMutex = new Mutex();

/**
 * Local capture pipeline: device stream, gain, highpass, denoiser (DeepFilterNet3 / RNNoise / pass-through),
 * expander, compressor, makeup, limiter, analyser, processed MediaStream.
 */
@Injectable({ providedIn: 'root' })
export class MicrophoneService {
  private readonly noiseSuppressor = inject(NOISE_SUPPRESSOR_PORT);
  private readonly audioContextResumeService = inject(
    AudioContextResumeService,
  );
  private readonly tuiNotificationService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);
  private readonly mediaDevicesService = inject(MediaDevicesService);
  private readonly switchNotifier = inject(MediaDeviceSwitchNotifierService);

  private readonly _analyserNode = signal<AnalyserNode | null>(null);
  /** Microphone analyser node */
  public readonly analyserNode = this._analyserNode.asReadonly();

  private readonly _processedStream = signal<MediaStream | null>(null);
  public readonly processedStream = this._processedStream.asReadonly();

  private readonly _captureLoading = signal(false);
  /** True while denoiser assets or capture pipeline are being prepared. */
  public readonly captureLoading = this._captureLoading.asReadonly();

  private readonly _inputMuted = signal(false);
  /** True while the active input track is hardware/system muted. */
  public readonly inputMuted = this._inputMuted.asReadonly();

  private context: AudioContext | null = null;
  private inputStream: MediaStream | null = null;

  private captureGraph: TCaptureGraph | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  private readonly wasmCache: TCaptureWasmCache = {};
  private processorPreference: ENoiseProcessor = ENoiseProcessor.DEEPFILTER;
  private activeProcessor: ENoiseProcessor = ENoiseProcessor.DEEPFILTER;
  private echoCancellationPreference = DEFAULT_ECHO_CANCELLATION;
  private dynamicsReady = false;
  private hasNotifiedCpuOverload = false;

  private device: MediaDeviceInfo | null = null;
  private gain = 1;

  /** Input track 'ended' (device unplugged) falls back through the same priority. */
  private readonly onInputTrackEnded = (event: Event): void => {
    if (event.target !== this.inputStream?.getAudioTracks()[0]) {
      return;
    }
    void this.handleDeviceChange();
  };

  private readonly onInputTrackMute = (event: Event): void => {
    if (event.target !== this.inputStream?.getAudioTracks()[0]) {
      return;
    }
    this._inputMuted.set(true);
  };

  private readonly onInputTrackUnmute = (event: Event): void => {
    if (event.target !== this.inputStream?.getAudioTracks()[0]) {
      return;
    }
    this._inputMuted.set(false);
  };

  constructor() {
    this.mediaDevicesService.deviceChange$
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.handleDeviceChange());
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
      this.ensurePipeline();
    }
  }

  /**
   * Set microphone gain (volume)
   * @param value
   */
  public setGain(value: number): void {
    this.gain = value;
    if (this.captureGraph?.gain) {
      this.captureGraph.gain.gain.value = value;
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

    return this.runWithCaptureLoading(async () => {
      await this.ensureContext();
      this.activeProcessor = await resolveDenoiser(
        this.context,
        this.processorPreference,
        this.noiseSuppressor,
        this.wasmCache,
      );
      await this.ensureDynamics();
      await this.ensureInputStream(this.device);
      this.ensurePipeline();
      return this.processedStream() as MediaStream;
    });
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
    this.wasmCache.dfModule = null;
    this.wasmCache.rnnoiseWasm = null;
    this.activeProcessor = this.processorPreference;
    this.dynamicsReady = false;
    this.hasNotifiedCpuOverload = false;
  }

  /**
   * Re-evaluates the input device after `devicechange` or an ended input track.
   * Switches only when the device that should be used (user choice, then
   * `communications`, then `default`) differs from the live one, so spurious events
   * (iOS/Safari fires `devicechange` after the first permission) change nothing.
   * The source node is swapped inside the graph: the processed track given to
   * mediasoup, mute state, processor, echo cancellation and analyser stay as they are.
   * Serialized with all other pipeline changes by the shared mutex.
   */
  private async handleDeviceChange(): Promise<void> {
    await publicMethodsMutex.runExclusive(() => this.switchToPreferredInput());
  }

  private async switchToPreferredInput(): Promise<void> {
    if (!this.processedStream() || !this.captureGraph) {
      return;
    }

    const devices = await this.mediaDevicesService
      .enumerateDevices()
      .catch((): MediaDeviceInfo[] => []);
    const desired = resolveMediaDevice(devices, 'audioinput', this.device);
    const track = this.inputStream?.getAudioTracks()[0];
    const isLive = track?.readyState === 'live';
    const currentId = isLive ? (track.getSettings().deviceId ?? null) : null;

    if (isLive && (!desired || desired.deviceId === currentId)) {
      return;
    }

    const previousId = track?.getSettings().deviceId ?? null;
    try {
      await this.reacquireInputStream();
    } catch (error) {
      console.warn('Failed to switch microphone device', error);
      return;
    }

    const next = this.inputStream?.getAudioTracks()[0];
    const nextId = next?.getSettings().deviceId ?? null;
    if (next && nextId !== previousId) {
      const label =
        devices.find(
          (item) => item.kind === 'audioinput' && item.deviceId === nextId,
        )?.label ||
        next.label ||
        '';
      this.switchNotifier.notify('audioinput', label);
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
                highLoadCount = 0;
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
    await publicMethodsMutex.runExclusive(async () => {
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
    });
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
    this.watchInputTrack(this.inputStream);
  }

  private watchInputTrack(stream: MediaStream | null): void {
    const track = stream?.getAudioTracks()[0];
    if (track) {
      track.addEventListener?.('ended', this.onInputTrackEnded);
      track.addEventListener?.('mute', this.onInputTrackMute);
      track.addEventListener?.('unmute', this.onInputTrackUnmute);
      this._inputMuted.set(track.muted ?? false);
    } else {
      this._inputMuted.set(false);
    }
  }

  private async reacquireInputStream(): Promise<void> {
    if (!this.context || !this.captureGraph) {
      return;
    }

    const previousStream = this.inputStream;
    this.inputStream = await getStream(this.device, {
      echoCancellation: this.echoCancellationPreference,
      noiseSuppression: this.activeProcessor === ENoiseProcessor.BROWSER,
    });
    this.watchInputTrack(this.inputStream);
    previousStream?.getTracks().forEach((track) => track.stop());

    this.captureGraph.source.disconnect();
    this.captureGraph.source = this.context.createMediaStreamSource(
      this.inputStream,
    );
    this.captureGraph.source.connect(this.captureGraph.gain);
  }

  private async applyProcessor(target: ENoiseProcessor): Promise<void> {
    const context = this.context;
    const captureGraph = this.captureGraph;
    if (!context || !captureGraph) {
      return;
    }

    await this.runWithCaptureLoading(async () => {
      const prevProcessor = this.activeProcessor;
      const resolved = await swapDenoiser(
        captureGraph,
        context,
        target,
        this.noiseSuppressor,
        this.wasmCache,
      );
      this.activeProcessor = resolved;

      const needsReacquire =
        (prevProcessor === ENoiseProcessor.BROWSER &&
          resolved !== ENoiseProcessor.BROWSER) ||
        (prevProcessor !== ENoiseProcessor.BROWSER &&
          resolved === ENoiseProcessor.BROWSER);

      if (needsReacquire) {
        await this.reacquireInputStream();
      }
    });
  }

  private async runWithCaptureLoading<T>(fn: () => Promise<T>): Promise<T> {
    this._captureLoading.set(true);
    try {
      return await fn();
    } finally {
      this._captureLoading.set(false);
    }
  }

  /**
   * Ensure audio context nodes ready
   */
  private ensurePipeline(): void {
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
      this.captureGraph = buildCaptureGraph(
        this.context,
        this.inputStream,
        {
          gain: this.gain,
          processor: this.activeProcessor,
          dynamicsReady: this.dynamicsReady,
        },
        this.noiseSuppressor,
        this.wasmCache,
      );

      const analyserNode = this.context.createAnalyser();
      analyserNode.fftSize = 128;
      analyserNode.smoothingTimeConstant = 0.2;

      this.destinationNode = this.context.createMediaStreamDestination();

      this.captureGraph.tail.connect(analyserNode);
      this.captureGraph.tail.connect(this.destinationNode);

      this._analyserNode.set(analyserNode);
      this._processedStream.set(this.destinationNode.stream);
    } catch (error) {
      this.cleanupPipeline();
      throw error;
    }
  }

  private cleanupInputStream() {
    const tracks = new Set<MediaStreamTrack>();
    this.inputStream?.getAudioTracks().forEach((track) => {
      track.removeEventListener?.('ended', this.onInputTrackEnded);
      track.removeEventListener?.('mute', this.onInputTrackMute);
      track.removeEventListener?.('unmute', this.onInputTrackUnmute);
      tracks.add(track);
    });
    this.processedStream()
      ?.getAudioTracks()
      .forEach((track) => tracks.add(track));

    tracks.forEach((track) => track.stop());
    this.inputStream = null;
    this._inputMuted.set(false);
  }

  private cleanupPipeline(): void {
    try {
      disposeCaptureGraph(this.captureGraph);
      this._analyserNode()?.disconnect();
      this.destinationNode?.disconnect();
    } catch (error) {
      console.error(error);
    } finally {
      this.captureGraph = null;
      this.destinationNode = null;
      this._analyserNode.set(null);
      this._processedStream.set(null);
    }
  }
}
