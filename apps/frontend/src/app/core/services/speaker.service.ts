import { inject, Injectable, OnDestroy } from '@angular/core';
import {
  createVoiceDynamicsNode,
  disposeVoiceDynamicsNode,
  ensureVoiceDynamicsWorklet,
} from '@core/audio/voice-dynamics';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { Mutex } from 'async-mutex';
import { AudioContextResumeService } from './audio-context-resume.service';

const publicMethodsMutex = new Mutex();

/** Playback AudioContext and output sink (`setSinkId`) for remote peer audio. */
@Injectable({
  providedIn: 'root',
})
export class SpeakerService implements OnDestroy {
  private readonly audioContextResumeService = inject(
    AudioContextResumeService,
  );
  private context: AudioContext | null = null;
  private device: MediaDeviceInfo | null = null;
  private busNode: GainNode | null = null;
  private limiterNode: AudioWorkletNode | null = null;
  private dynamicsContext: AudioContext | null = null;
  private dynamicsReady: Promise<boolean> | null = null;

  private readonly onDeviceChange = async () => {
    await this.ensureContext();
  };

  constructor() {
    navigator.mediaDevices?.addEventListener(
      'devicechange',
      this.onDeviceChange,
    );
  }

  @Mutexed(publicMethodsMutex)
  public async setDevice(device: MediaDeviceInfo | null) {
    this.device = device;
    await this.setSinkId(this.device);
  }

  @Mutexed(publicMethodsMutex)
  public async getContext(): Promise<AudioContext> {
    return await this.ensureContext();
  }

  /**
   * Mix bus for remote playback. One limiter sits after it for the whole
   * speaker context, so peer attach does not add another worklet.
   */
  @Mutexed(publicMethodsMutex)
  public async getOutput(): Promise<AudioNode> {
    const context = await this.ensureContext();
    if (this.busNode) {
      return this.busNode;
    }
    const bus = context.createGain();
    const ready = await this.prepareDynamics(context);
    if (ready) {
      let limiter: AudioWorkletNode | null = null;
      try {
        limiter = createVoiceDynamicsNode(context, 'limiter');
        bus.connect(limiter);
        limiter.connect(context.destination);
        this.limiterNode = limiter;
        this.busNode = bus;
        return bus;
      } catch (error) {
        console.warn('Playback limiter unavailable', error);
        try {
          bus.disconnect();
        } catch {
          // The bus may not be connected yet.
        }
        if (limiter) {
          disposeVoiceDynamicsNode(limiter);
        }
      }
    }
    bus.connect(context.destination);
    this.busNode = bus;
    return bus;
  }

  @Mutexed(publicMethodsMutex)
  public async release(): Promise<void> {
    this.clearOutput();
    if (this.context && this.context.state !== 'closed') {
      try {
        if (
          'setSinkId' in this.context &&
          typeof this.context.setSinkId === 'function'
        ) {
          await this.context.setSinkId('default');
        }
        this.audioContextResumeService.unregister(this.context);
        await this.context.close();
      } catch (error) {
        console.warn('Failed to close speaker context', error);
      }
    }

    this.context = null;
    this.dynamicsContext = null;
    this.dynamicsReady = null;
  }

  ngOnDestroy(): void {
    navigator.mediaDevices?.removeEventListener(
      'devicechange',
      this.onDeviceChange,
    );
    void this.release();
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.context || this.context.state === 'closed') {
      if (this.context) {
        this.audioContextResumeService.unregister(this.context);
      }
      this.clearOutput();
      this.context = new AudioContext({ sampleRate: 48000 });
      this.dynamicsContext = null;
      this.dynamicsReady = null;
      this.audioContextResumeService.register(this.context);
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    await this.prepareDynamics(this.context);
    await this.setSinkId(this.device);
    return this.context;
  }

  private prepareDynamics(context: AudioContext): Promise<boolean> {
    if (this.dynamicsContext === context && this.dynamicsReady) {
      return this.dynamicsReady;
    }
    this.dynamicsContext = context;
    this.dynamicsReady = ensureVoiceDynamicsWorklet(context).then(
      () => true,
      (error: unknown) => {
        console.warn('Voice dynamics worklet failed to load', error);
        return false;
      },
    );
    return this.dynamicsReady;
  }

  private clearOutput(): void {
    const limiter = this.limiterNode;
    const bus = this.busNode;
    this.limiterNode = null;
    this.busNode = null;
    try {
      if (limiter) {
        disposeVoiceDynamicsNode(limiter);
      }
      bus?.disconnect();
    } catch (error) {
      console.warn('Failed to disconnect speaker bus', error);
    }
  }

  private async setSinkId(device: MediaDeviceInfo | null) {
    if (
      this.context &&
      'setSinkId' in this.context &&
      typeof this.context.setSinkId == 'function'
    ) {
      try {
        if (device) {
          return await this.context.setSinkId(device.deviceId);
        }
      } catch {
        await this.context.setSinkId('default');
      }
    }
  }
}
