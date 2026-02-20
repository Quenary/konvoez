import { Injectable, OnDestroy } from '@angular/core';
import { SpeexWorkletNode, loadSpeex } from '@sapphi-red/web-noise-suppressor';
import speexWorkletUrl from '@sapphi-red/web-noise-suppressor/speexWorklet.js?url';
import speexWasmUrl from '@sapphi-red/web-noise-suppressor/speex.wasm?url';
import { getStream } from '../../shared/functions/get-stream.function';

@Injectable({ providedIn: 'root' })
export class MicrophoneService implements OnDestroy {
  private context: AudioContext | null = null;

  private inputStream: MediaStream | null = null;
  private processedStream: MediaStream | null = null;

  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private biquadNode: BiquadFilterNode | null = null;
  private speexNode: SpeexWorkletNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  private speexWasmBinary: ArrayBuffer | null = null;
  private workletLoaded = false;

  private device: MediaDeviceInfo | null = null;
  private gain: number = 1;

  private readonly onTrackEnded = async () => {
    await this.ensureStream(this.device);
  };

  private readonly onDeviceChange = async () => {
    await this.ensureStream(this.device);
  };

  constructor() {
    navigator.mediaDevices.addEventListener(
      'devicechange',
      this.onDeviceChange,
    );
  }

  private async ensureContext() {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext({ sampleRate: 48000 });
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  private async ensureWasm() {
    if (!this.speexWasmBinary) {
      this.speexWasmBinary = await loadSpeex({ url: speexWasmUrl });
    }
  }

  private async ensureWorklet() {
    if (!this.context) {
      return;
    }
    if (!this.workletLoaded) {
      await this.context.audioWorklet.addModule(speexWorkletUrl);
      this.workletLoaded = true;
    }
  }

  private async ensureStream(device: MediaDeviceInfo | null) {
    this.stopInputStream();

    this.inputStream = await getStream(device);

    const track = this.inputStream.getAudioTracks()[0];

    track.onended = () => {
      this.onTrackEnded();
    };
  }

  private async ensureNodes() {
    if (!this.context || !this.inputStream) {
      return;
    }

    this.cleanupNodes();

    this.sourceNode = this.context.createMediaStreamSource(this.inputStream);

    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = this.gain;

    this.biquadNode = this.context.createBiquadFilter();
    this.biquadNode.type = 'highpass';
    this.biquadNode.frequency.value = 80;
    this.biquadNode.Q.value = 0.7;

    this.speexNode = new SpeexWorkletNode(this.context, {
      wasmBinary: this.speexWasmBinary!,
      maxChannels: 1,
    });

    this.analyserNode = this.context.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.1;

    this.destinationNode = this.context.createMediaStreamDestination();

    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.biquadNode);
    this.biquadNode.connect(this.speexNode);
    this.speexNode.connect(this.analyserNode);
    this.speexNode.connect(this.destinationNode);

    this.processedStream = this.destinationNode.stream;
  }

  private cleanupNodes() {
    try {
      this.sourceNode?.disconnect();
      this.gainNode?.disconnect();
      this.biquadNode?.disconnect();
      this.speexNode?.disconnect();
      this.destinationNode?.disconnect();
    } catch {}

    this.sourceNode = null;
    this.gainNode = null;
    this.biquadNode = null;
    this.speexNode = null;
    this.destinationNode = null;
    this.processedStream = null;
  }

  private stopInputStream() {
    this.inputStream?.getTracks().forEach((t) => t.stop());
    this.inputStream = null;
  }

  /**
   * Set input device (microphone)
   * @param device
   */
  public async setDevice(device: MediaDeviceInfo | null) {
    this.device = device;
    if (this.context) {
      await this.ensureStream(device);
      await this.ensureNodes();
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
  public async getStream(): Promise<MediaStream> {
    if (this.processedStream) {
      return this.processedStream;
    }
    await this.ensureContext();
    await this.ensureWasm();
    await this.ensureWorklet();
    await this.ensureStream(this.device);
    await this.ensureNodes();
    return this.processedStream as any;
  }

  public async getAnalyser(): Promise<AnalyserNode> {
    await this.ensureContext();
    await this.ensureWasm();
    await this.ensureWorklet();
    await this.ensureStream(this.device);
    await this.ensureNodes();
    return this.analyserNode as AnalyserNode;
  }

  ngOnDestroy() {
    navigator.mediaDevices.removeEventListener(
      'devicechange',
      this.onDeviceChange,
    );
    this.cleanupNodes();
    this.stopInputStream();
    if (this.context && this.context.state !== 'closed') {
      this.context.close();
    }
    this.context = null;
  }
}
