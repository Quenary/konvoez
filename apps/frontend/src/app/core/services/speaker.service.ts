import { inject, Injectable, OnDestroy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  createVoiceDynamicsNode,
  disposeVoiceDynamicsNode,
  ensureVoiceDynamicsWorklet,
} from '@core/audio/voice-dynamics';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { Mutex } from 'async-mutex';
import { AudioContextResumeService } from './audio-context-resume.service';
import { MediaDevicesService } from './media-devices.service';
import { MediaDeviceSwitchNotifierService } from './media-device-switch-notifier.service';
import {
  DEFAULT_DEVICE_ID,
  prioritizedDevices,
} from '@shared/functions/media-device-priority.function';

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
  private readonly mediaDevicesService = inject(MediaDevicesService);
  private readonly switchNotifier = inject(MediaDeviceSwitchNotifierService);
  private context: AudioContext | null = null;
  private device: MediaDeviceInfo | null = null;
  private busNode: GainNode | null = null;
  private masterGainNode: GainNode | null = null;
  private masterVolume = 1;
  private limiterNode: AudioWorkletNode | null = null;
  private limiterLoad: Promise<void> | null = null;
  private limiterWaitDone = false;
  private limiterFailed = false;

  constructor() {
    this.mediaDevicesService.deviceChange$
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.handleDeviceChange());
  }

  @Mutexed(publicMethodsMutex)
  public async setDevice(device: MediaDeviceInfo | null) {
    this.device = device;
    await this.setSinkId(this.device);
  }

  public setMasterVolume(volume: number): void {
    this.masterVolume = volume;
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = volume;
    }
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
      const masterGain = context.createGain();
      masterGain.gain.value = this.masterVolume;
      bus.connect(masterGain);
      masterGain.connect(context.destination);
      this.busNode = bus;
      this.masterGainNode = masterGain;
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
    void this.release();
  }

  /** Re-applies the output priority to a live context; never creates one. */
  @Mutexed(publicMethodsMutex)
  private async handleDeviceChange(): Promise<void> {
    if (!this.context || this.context.state === 'closed') {
      return;
    }
    const switched = await this.setSinkId(this.device);
    if (switched) {
      this.switchNotifier.notify('audiooutput', switched.label);
    }
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
    const masterGain = this.masterGainNode;
    if (this.context !== context || !masterGain || this.limiterNode) {
      return;
    }
    const limiter = createVoiceDynamicsNode(context, 'playback-limiter');
    try {
      masterGain.disconnect();
      masterGain.connect(limiter);
      limiter.connect(context.destination);
      this.limiterNode = limiter;
    } catch (error) {
      disposeVoiceDynamicsNode(limiter);
      masterGain.connect(context.destination);
      throw error;
    }
  }

  private clearOutput(): void {
    const limiter = this.limiterNode;
    const bus = this.busNode;
    const masterGain = this.masterGainNode;
    this.limiterLoad = null;
    this.limiterNode = null;
    this.busNode = null;
    this.masterGainNode = null;
    this.limiterWaitDone = false;
    this.limiterFailed = false;
    try {
      if (limiter) {
        disposeVoiceDynamicsNode(limiter);
      }
      masterGain?.disconnect();
      bus?.disconnect();
    } catch (error) {
      console.warn('Failed to disconnect speaker bus', error);
    }
  }

  /**
   * Output priority: the user's device (id, then similar label), `communications`,
   * `default`. Skips the call when the context already plays to the wanted sink.
   * With no candidates (no virtual ids and no stored device) the browser default stays.
   */
  /** Returns the newly applied output (id + label) when the sink actually changed. */
  private async setSinkId(
    device: MediaDeviceInfo | null,
  ): Promise<{ deviceId: string; label: string } | null> {
    const context = this.context as
      | (AudioContext & {
          sinkId?: string | object;
          setSinkId?: (id: string) => Promise<void>;
        })
      | null;
    if (!context || typeof context.setSinkId !== 'function') {
      return null;
    }

    const devices = await this.mediaDevicesService
      .enumerateDevices()
      .catch((): MediaDeviceInfo[] => []);
    const candidates = prioritizedDevices(devices, 'audiooutput', device).map(
      (item) => item.deviceId,
    );
    if (!candidates.length && device?.deviceId) {
      candidates.push(device.deviceId);
    }
    if (!candidates.length) {
      return null;
    }
    if (context.sinkId === candidates[0]) {
      return null;
    }

    const previous = context.sinkId;
    for (const id of candidates) {
      try {
        await context.setSinkId(id);
        if (id === previous) {
          return null;
        }
        const label =
          devices.find(
            (item) => item.kind === 'audiooutput' && item.deviceId === id,
          )?.label ?? '';
        return { deviceId: id, label };
      } catch (error) {
        console.warn(`setSinkId failed for "${id}"`, error);
      }
    }
    try {
      await context.setSinkId(DEFAULT_DEVICE_ID);
    } catch {
      // keep the current sink
    }
    return null;
  }
}
