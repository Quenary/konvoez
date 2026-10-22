import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { NOISE_SUPPRESSOR_PORT } from '@core/audio/noise-suppressor.port';
import { ensureVoiceDynamicsWorklet } from '@core/audio/voice-dynamics';
import {
  type TCaptureGraph,
  type TCaptureWasmCache,
  buildCaptureGraph,
  disposeCaptureGraph,
  resolveDenoiser,
} from '@core/audio/capture-graph';
import { getStream } from '@shared/functions/get-stream.function';
import { Mutex } from 'async-mutex';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { AudioContextResumeService } from './audio-context-resume.service';
import { SettingsStore } from '@core/stores/settings.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { ENoiseProcessor } from '../../app.enums';

const testMutex = new Mutex();

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
  private captureGraph: TCaptureGraph | null = null;
  private analyserNode: AnalyserNode | null = null;

  private readonly wasmCache: TCaptureWasmCache = {};
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
      this.destroyRef.onDestroy(() => {
        document.removeEventListener(
          'visibilitychange',
          this.onVisibilityChange,
        );
        void this.stop();
      });
    }

    effect(() => {
      const activeSession = this.voiceSessionStore.activeSession();
      if (activeSession && this._isRunning()) {
        void this.stop();
      }
    });

    effect(() => {
      const gain = this.settingsStore.inputGain();
      if (this.captureGraph?.gain) {
        this.captureGraph.gain.gain.value = gain;
      }
    });
  }

  /**
   * Start mic test with selected input and output devices.
   */
  @Mutexed(testMutex)
  public async start(
    inputDevice: MediaDeviceInfo | null,
    outputDevice: MediaDeviceInfo | null,
  ): Promise<void> {
    if (this._isRunning()) {
      return;
    }
    await this.startInternal(inputDevice, outputDevice);
  }

  /**
   * Stop mic test and tear down audio graph.
   */
  @Mutexed(testMutex)
  public async stop(): Promise<void> {
    await this.stopInternal();
  }

  /**
   * Restart mic test (e.g., when changing input device or processor).
   * No-op if not running.
   */
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

  /**
   * Set output audio sink device dynamically without restarting pipeline if supported.
   */
  @Mutexed(testMutex)
  public async setOutputDevice(device: MediaDeviceInfo | null): Promise<void> {
    this.currentOutputDevice = device;
    if (this.context && this._isRunning()) {
      await this.applySink(device);
    }
  }

  public setGain(value: number): void {
    if (this.captureGraph?.gain) {
      this.captureGraph.gain.gain.value = value;
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

    const preferredProcessor = this.settingsStore.effectiveNoiseProcessor();
    const echoCancellation = this.settingsStore.echoCancellation();
    const inputGain = this.settingsStore.inputGain();

    // Strictly the device selected in settings: no auto-switch fallback here.
    this.inputStream = await getStream(device, {
      echoCancellation,
      noiseSuppression: preferredProcessor === ENoiseProcessor.BROWSER,
      strictDevice: true,
    });

    const resolvedProcessor = await resolveDenoiser(
      this.context,
      preferredProcessor,
      this.noiseSuppressor,
      this.wasmCache,
    );

    this.captureGraph = buildCaptureGraph(
      this.context,
      this.inputStream,
      {
        gain: inputGain,
        processor: resolvedProcessor,
        dynamicsReady: this.dynamicsReady,
      },
      this.noiseSuppressor,
      this.wasmCache,
    );

    this.analyserNode = this.context.createAnalyser();
    this.analyserNode.fftSize = 128;
    this.analyserNode.smoothingTimeConstant = 0.2;

    this.captureGraph.tail.connect(this.analyserNode);
    this.captureGraph.tail.connect(this.context.destination);
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
      disposeCaptureGraph(this.captureGraph);
      this.analyserNode?.disconnect();
    } catch {
      // Disconnect error ignored
    } finally {
      this.captureGraph = null;
      this.analyserNode = null;
    }
  }
}
