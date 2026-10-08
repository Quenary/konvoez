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

/** Hung worklet script must not hold the speaker mutex for the whole session. */
export const SPEAKER_WORKLET_LOAD_TIMEOUT_MS = 2000;

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('worklet load timed out'));
    }, ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(
          error instanceof Error ? error : new Error('worklet load failed'),
        );
      },
    );
  });
}

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
  private limiterLoad: Promise<void> | null = null;
  private limiterWaitDone = false;
  private limiterFailed = false;

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
    if (!this.busNode) {
      const bus = context.createGain();
      bus.connect(context.destination);
      this.busNode = bus;
    }
    if (!this.limiterNode && !this.limiterFailed) {
      if (!this.limiterWaitDone) {
        this.limiterWaitDone = true;
        try {
          await withTimeout(
            this.startLimiterLoad(context),
            SPEAKER_WORKLET_LOAD_TIMEOUT_MS,
          );
        } catch (error) {
          console.warn('Playback limiter load timed out', error);
        }
      } else {
        void this.startLimiterLoad(context);
      }
    }
    return this.busNode;
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
      this.audioContextResumeService.register(this.context);
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    await this.setSinkId(this.device);
    return this.context;
  }

  private startLimiterLoad(context: AudioContext): Promise<void> {
    if (this.limiterFailed) {
      return Promise.resolve();
    }
    if (this.limiterLoad) {
      return this.limiterLoad;
    }
    const loading = this.attachLimiter(context).catch((error: unknown) => {
      this.limiterFailed = true;
      console.warn('Playback limiter unavailable', error);
    });
    this.limiterLoad = loading;
    void loading.finally(() => {
      if (this.limiterLoad === loading) {
        this.limiterLoad = null;
      }
    });
    return loading;
  }

  private async attachLimiter(context: AudioContext): Promise<void> {
    await ensureVoiceDynamicsWorklet(context);
    const bus = this.busNode;
    if (this.context !== context || !bus || this.limiterNode) {
      return;
    }
    const limiter = createVoiceDynamicsNode(context, 'limiter');
    try {
      bus.disconnect();
      bus.connect(limiter);
      limiter.connect(context.destination);
      this.limiterNode = limiter;
    } catch (error) {
      disposeVoiceDynamicsNode(limiter);
      bus.connect(context.destination);
      throw error;
    }
  }

  private clearOutput(): void {
    const limiter = this.limiterNode;
    const bus = this.busNode;
    this.limiterLoad = null;
    this.limiterNode = null;
    this.busNode = null;
    this.limiterWaitDone = false;
    this.limiterFailed = false;
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
