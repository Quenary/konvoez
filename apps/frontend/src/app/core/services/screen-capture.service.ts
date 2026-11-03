import { Injectable, Injector, OnDestroy, inject } from '@angular/core';
import { TStreamContentMode } from '@konvoez/shared';
import {
  DEFAULT_STREAM_FPS,
  DEFAULT_STREAM_HEIGHT,
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';
import { SettingsStore } from '@core/stores/settings.store';
import { getDesktopBridge } from '@core/desktop/desktop-bridge';
import { ensureWorkletModule } from '@core/audio/ensure-worklet-module';
import { MediaDevicesService } from './media-devices.service';

export type TScreenCaptureResult = {
  videoTrack: MediaStreamTrack;
  audioTrack: MediaStreamTrack | null;
};

/**
 * getDisplayMedia capture for screen share. SettingsStore is resolved lazily
 * to avoid VoiceSessionService ↔ SettingsStore DI cycles.
 */
@Injectable({ providedIn: 'root' })
export class ScreenCaptureService implements OnDestroy {
  private readonly mediaDevicesService = inject(MediaDevicesService);
  private readonly injector = inject(Injector);

  /** Lazy: SettingsStore → AUDIO_DEVICE_HANDLER → VoiceSessionService. */
  private get settingsStore(): InstanceType<typeof SettingsStore> {
    return this.injector.get(SettingsStore);
  }

  private stream: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private audioTrack: MediaStreamTrack | null = null;

  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private screenAudioPort: MessagePort | null = null;

  public isSupported(): boolean {
    return this.mediaDevicesService.isDisplayMediaSupported();
  }

  ngOnDestroy(): void {
    this.release();
  }

  public async getTracks(options?: {
    height?: TStreamHeight;
    fps?: TStreamFps;
    contentMode?: TStreamContentMode;
  }): Promise<TScreenCaptureResult> {
    const height =
      options?.height ??
      this.settingsStore.screenHeight() ??
      DEFAULT_STREAM_HEIGHT;
    const fps =
      options?.fps ?? this.settingsStore.screenFps() ?? DEFAULT_STREAM_FPS;

    this.release();

    const bridge = getDesktopBridge();
    const useNativeAudio = Boolean(bridge?.nativeAudio);

    let portPromise: Promise<MessagePort | null> | null = null;
    let cleanupPortListener: (() => void) | undefined;
    let beginPortWait: (() => void) | undefined;
    let portDiscarded = false;

    if (useNativeAudio) {
      portPromise = new Promise<MessagePort | null>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const stopPort = (port: MessagePort): void => {
          try {
            port.postMessage('stop');
            port.close();
          } catch {
            // best-effort
          }
        };

        const finish = (port: MessagePort | null): void => {
          if (settled) {
            if (port) {
              stopPort(port);
            }
            return;
          }
          settled = true;
          if (timer !== undefined) {
            clearTimeout(timer);
          }
          if (port && portDiscarded) {
            stopPort(port);
            resolve(null);
            return;
          }
          resolve(port);
        };

        cleanupPortListener = bridge?.onScreenAudioPort?.((port) => {
          finish(port);
        });
        // The picker runs inside getDisplayMedia. Arm the timeout only after
        // that call returns, and stop a port that arrives once the wait is over.
        beginPortWait = () => {
          if (settled) {
            return;
          }
          timer = setTimeout(() => finish(null), 2000);
        };
      });
    }

    let stream: MediaStream;
    try {
      stream = await this.mediaDevicesService.getDisplayMedia({
        video: {
          height: { ideal: height },
          frameRate: { ideal: fps },
        },
        audio: true,
      });
    } catch (err) {
      portDiscarded = true;
      cleanupPortListener?.();
      throw err;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      portDiscarded = true;
      cleanupPortListener?.();
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('Screen share has no video track');
    }

    const contentMode = options?.contentMode ?? 'detail';
    const contentHint = contentMode === 'motion' ? 'motion' : 'detail';
    try {
      videoTrack.contentHint = contentHint;
    } catch {
      // best-effort
    }

    beginPortWait?.();

    let audioTrack: MediaStreamTrack | null = null;

    if (useNativeAudio && portPromise) {
      const port = await portPromise;
      cleanupPortListener?.();

      if (port) {
        try {
          const audioContext = new AudioContext({ sampleRate: 48000 });
          this.audioContext = audioContext;
          await ensureWorkletModule(
            audioContext,
            'audio/pcm-screen-audio.worklet.js',
          );
          const workletNode = new AudioWorkletNode(
            audioContext,
            'konvoez/pcm-screen-audio',
            {
              numberOfInputs: 0,
              numberOfOutputs: 1,
              outputChannelCount: [2],
            },
          );
          workletNode.port.postMessage(port, [port]);
          const destNode = audioContext.createMediaStreamDestination();
          workletNode.connect(destNode);

          this.workletNode = workletNode;
          this.screenAudioPort = port;
          audioTrack = destNode.stream.getAudioTracks()[0] ?? null;
        } catch (err) {
          console.warn(
            '[ScreenCapture] Failed to initialize native audio worklet:',
            err,
          );
          try {
            port.postMessage('stop');
            port.close();
          } catch {
            // best-effort
          }
        }
      }
    } else {
      audioTrack = stream.getAudioTracks()[0] ?? null;
    }

    this.stream = stream;
    this.videoTrack = videoTrack;
    this.audioTrack = audioTrack;

    videoTrack.addEventListener('ended', () => {
      if (this.videoTrack === videoTrack) {
        this.release();
      }
    });

    return { videoTrack, audioTrack };
  }

  public release(): void {
    const video = this.videoTrack;
    const audio = this.audioTrack;
    this.videoTrack = null;
    this.audioTrack = null;

    if (this.screenAudioPort) {
      try {
        this.screenAudioPort.postMessage('stop');
        this.screenAudioPort.close();
      } catch {
        // best-effort
      }
      this.screenAudioPort = null;
    }

    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch {
        // best-effort
      }
      this.workletNode = null;
    }

    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch {
        // best-effort
      }
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (video && video.readyState !== 'ended') {
      video.stop();
    }
    if (audio && audio.readyState !== 'ended') {
      audio.stop();
    }
  }
}
