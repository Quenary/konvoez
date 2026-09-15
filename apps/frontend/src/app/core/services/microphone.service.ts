import { Injectable, signal } from '@angular/core';
import { SpeexWorkletNode, loadSpeex } from '@sapphi-red/web-noise-suppressor';
const speexWorkletUrl = 'assets/web-noise-suppressor/speex/workletProcessor.js';
const speexWasmUrl = 'assets/web-noise-suppressor/speex.wasm';
import { getStream } from '@shared/functions/get-stream.function';
import { Mutex } from 'async-mutex';
import { Mutexed } from '@shared/decorators/mutex.decorator';

const publicMethodsMutex = new Mutex();

@Injectable({ providedIn: 'root' })
export class MicrophoneService {
  private context: AudioContext | null = null;

  private inputStream: MediaStream | null = null;

  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private biquadNode: BiquadFilterNode | null = null;
  private speexNode: SpeexWorkletNode | null = null;
  private readonly _analyserNode = signal<AnalyserNode | null>(null);
  /**
   * Microphone analyser node
   */
  public readonly analyserNode = this._analyserNode.asReadonly();
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  private speexWasmBinary: ArrayBuffer | null = null;
  private workletLoaded: Promise<void> | null = null;

  private device: MediaDeviceInfo | null = null;
  private gain = 1;

  private readonly _processedStream = signal<MediaStream | null>(null);
  public readonly processedStream = this._processedStream.asReadonly();

  constructor() {
    navigator.mediaDevices.addEventListener('devicechange', () =>
      this.setDevice(this.device),
    );

    window.addEventListener('click', async () => {
      if (this.context?.state === 'suspended') {
        await this.context.resume();
      }
    });
  }

  @Mutexed()
  private async ensureContext() {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext({ sampleRate: 48000 });
      this.workletLoaded = null;
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  @Mutexed()
  private async ensureWasm() {
    if (!this.speexWasmBinary) {
      this.speexWasmBinary = await loadSpeex({ url: speexWasmUrl });
    }
  }

  private async ensureWorklet() {
    if (!this.context) {
      console.warn('ensureWorklet(): missing context');
      return;
    }
    if (!this.workletLoaded) {
      this.workletLoaded = this.context.audioWorklet.addModule(speexWorkletUrl);
    }
    await this.workletLoaded;
  }

  /**
   * Ensure input stream ready
   * @param device
   * @returns
   */
  @Mutexed()
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
  @Mutexed()
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

    this.sourceNode = this.context.createMediaStreamSource(this.inputStream);

    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = this.gain;

    this.biquadNode = this.context.createBiquadFilter();
    this.biquadNode.type = 'highpass';
    this.biquadNode.frequency.value = 80;
    this.biquadNode.Q.value = 0.7;

    this.speexNode = new SpeexWorkletNode(this.context, {
      wasmBinary: this.speexWasmBinary as ArrayBuffer,
      maxChannels: 1,
    });

    const analyserNode = this.context.createAnalyser();
    analyserNode.fftSize = 512;
    analyserNode.smoothingTimeConstant = 0.1;

    this.destinationNode = this.context.createMediaStreamDestination();

    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.biquadNode);
    this.biquadNode.connect(this.speexNode);
    this.speexNode.connect(analyserNode);
    this.speexNode.connect(this.destinationNode);

    this._analyserNode.set(analyserNode);
    this._processedStream.set(this.destinationNode.stream);
  }

  private cleanupInputStream() {
    this.inputStream?.getAudioTracks().forEach((t) => t.stop());
    this.inputStream = null;
  }

  private cleanupPipeline() {
    try {
      this.sourceNode?.disconnect();
      this.gainNode?.disconnect();
      this.biquadNode?.disconnect();
      this.speexNode?.disconnect();
      this.destinationNode?.disconnect();
    } catch (error) {
      console.error(error);
    } finally {
      this.sourceNode = null;
      this.gainNode = null;
      this.biquadNode = null;
      this.speexNode = null;
      this.destinationNode = null;
      this.processedStream()
        ?.getAudioTracks()
        .forEach((t) => t.stop());
      this._processedStream.set(null);
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
    await this.ensureWasm();
    await this.ensureWorklet();
    await this.ensureInputStream(this.device);
    await this.ensurePipeline();
    return this.processedStream() as MediaStream;
  }
}
