import { Injectable, Injector, OnDestroy, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { TStreamContentMode } from '@konvoez/shared';
import {
  DEFAULT_SCREEN_CONTENT_MODE,
  DEFAULT_STREAM_FPS,
  DEFAULT_STREAM_HEIGHT,
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';
import { APP_VERSION, withVersion } from '@core/asset-version';
import { SettingsStore } from '@core/stores/settings.store';
import { getDesktopBridge } from '@core/desktop/desktop-bridge';
import { subscribeScreenAudioPort } from '@core/desktop/screen-audio-port';
import { ensureWorkletModule } from '@core/audio/ensure-worklet-module';
import { MediaDevicesService } from './media-devices.service';
import { AudioContextResumeService } from './audio-context-resume.service';

/** Classic worklet script served from `public/`. Version query busts the immutable nginx cache. */
const PCM_SCREEN_AUDIO_WORKLET_URL = withVersion(
  'audio/pcm-screen-audio.worklet.js',
  APP_VERSION,
);

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
  private readonly audioContextResumeService = inject(
    AudioContextResumeService,
  );

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

        cleanupPortListener = subscribeScreenAudioPort((port, mode) => {
          if (!settled && mode === 'loopback') {
            this.warnScreenAudioLoopback();
          }
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

    const contentMode = options?.contentMode ?? DEFAULT_SCREEN_CONTENT_MODE;
    const contentHint = contentMode === 'motion' ? 'motion' : 'text';
    try {
      videoTrack.contentHint = contentHint;
    } catch {
      // best-effort
    }

    beginPortWait?.();

    let audioTrack: MediaStreamTrack | null;

    const displayAudio = (): MediaStreamTrack | null =>
      stream.getAudioTracks()[0] ?? null;

    if (useNativeAudio && portPromise) {
      const port = await portPromise;
      cleanupPortListener?.();

      if (port) {
        let audioContext: AudioContext | null = null;
        let workletNode: AudioWorkletNode | null = null;
        try {
          audioContext = new AudioContext({ sampleRate: 48000 });
          this.audioContext = audioContext;
          this.audioContextResumeService.register(audioContext);
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }
          await ensureWorkletModule(audioContext, PCM_SCREEN_AUDIO_WORKLET_URL);
          const node = new AudioWorkletNode(
            audioContext,
            'konvoez/pcm-screen-audio',
            {
              numberOfInputs: 0,
              numberOfOutputs: 1,
              outputChannelCount: [2],
            },
          );
          workletNode = node;
          port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
            node.port.postMessage(event.data, [event.data]);
          };
          port.start();
          const destNode = audioContext.createMediaStreamDestination();
          node.connect(destNode);

          this.workletNode = node;
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
          if (workletNode) {
            try {
              workletNode.disconnect();
            } catch {
              // best-effort
            }
          }
          if (audioContext) {
            this.audioContextResumeService.unregister(audioContext);
            try {
              void audioContext.close();
            } catch {
              // best-effort
            }
            if (this.audioContext === audioContext) {
              this.audioContext = null;
            }
          }
          audioTrack = displayAudio();
        }
      } else {
        audioTrack = displayAudio();
      }
    } else {
      audioTrack = displayAudio();
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

    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage('stop');
      } catch {
        // best-effort
      }
      try {
        this.workletNode.disconnect();
      } catch {
        // best-effort
      }
      this.workletNode = null;
    }

    if (this.screenAudioPort) {
      try {
        this.screenAudioPort.onmessage = null;
        this.screenAudioPort.postMessage('stop');
        this.screenAudioPort.close();
      } catch {
        // best-effort
      }
      this.screenAudioPort = null;
    }

    if (this.audioContext) {
      this.audioContextResumeService.unregister(this.audioContext);
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

  private warnScreenAudioLoopback(): void {
    const notifications = this.injector.get(TuiNotificationService);
    const translate = this.injector.get(TranslateService);
    notifications
      .open(translate.instant('CALL.SCREEN_AUDIO_LOOPBACK'), {
        appearance: 'warning',
        autoClose: 5000,
        closable: true,
      })
      .subscribe();
  }
}
