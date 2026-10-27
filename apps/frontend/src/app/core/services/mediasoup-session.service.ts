import { inject, Injectable, Injector } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  advanceVoiceLiveness,
  buildVoiceLadder,
  createInitialVoiceLiveness,
  EVoiceQualityTier,
  EVoiceRoomEvent,
  TVoiceLadderEntry,
  TVoiceLivenessState,
  TVoiceQualitySample,
  TVoiceRoomCloseProducer,
  TVoiceRoomConnectTransport,
  TVoiceRoomConsume,
  TVoiceRoomConsumeResult,
  TVoiceRoomCreateTransport,
  TVoiceRoomCreateTransportResult,
  TVoiceRoomMediaTag,
  TVoiceRoomProduce,
  TVoiceRoomProducerScore,
  TVoiceRoomProduceResult,
  TVoiceRoomRestartIce,
  TVoiceRoomRestartIceResult,
  TVoiceTransportState,
  VOICE_QUALITY_VIDEO_CAPS,
  VOICE_WATCHDOG_INTERVAL_MS,
} from '@konvoez/shared';
import { Mutex } from 'async-mutex';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { notifyError } from '@shared/functions/notify-error.function';
import { VoiceConnectionStore } from '@core/voice/voice-connection.store';
import type { Device } from 'mediasoup-client';
import type {
  ConsumerOptions,
  IceParameters,
  Producer,
  RtpCapabilities,
  RtpCodecCapability,
  Transport,
  TransportOptions,
} from 'mediasoup-client/types';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import {
  emitVoiceRoomWithAck,
  isVoiceSocketAckTimeout,
  VOICE_JOIN_ACK_MS,
} from './voice-room-socket-ack';
import { SettingsStore } from '@core/stores/settings.store';
import { MicrophoneService } from './microphone.service';
import { MediaDeviceSwitchNotifierService } from './media-device-switch-notifier.service';
import { CameraService } from './camera.service';
import { ScreenCaptureService } from './screen-capture.service';
import { PeerPlaybackService } from './peer-playback.service';
import { PeerScreenAudioService } from './peer-screen-audio.service';
import { ConsumerRegistry } from './consumer-registry';
import { PeerVideoService } from './peer-video.service';
import { AudioService } from './audio.service';
import { VoiceQualityService } from './voice-quality.service';

export interface IConsumePeerContext {
  gain: number;
  speakerMuted: boolean;
}

/**
 * Mediasoup-client Device, send/recv transports, mic/cam produce, and remote consume.
 * Pending consumes wait until the peer exists in VoiceSessionStore.
 */
@Injectable({
  providedIn: 'root',
})
export class MediasoupSessionService {
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly injector = inject(Injector);
  private readonly audioService = inject(AudioService);
  private readonly microphoneService = inject(MicrophoneService);
  private readonly cameraService = inject(CameraService);
  private readonly screenCaptureService = inject(ScreenCaptureService);
  private readonly peerPlaybackService = inject(PeerPlaybackService);
  private readonly peerScreenAudioService = inject(PeerScreenAudioService);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly switchNotifier = inject(MediaDeviceSwitchNotifierService);
  private readonly consumerRegistry = inject(ConsumerRegistry);
  private readonly voiceQualityService = inject(VoiceQualityService);
  private readonly voiceConnectionStore = inject(VoiceConnectionStore);
  private readonly tuiNotificationService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  private readonly sessionMutex = new Mutex();
  private readonly microphoneMutex = new Mutex();
  private readonly cameraMutex = new Mutex();
  private readonly screenMutex = new Mutex();
  private readonly consumeMutex = new Mutex();
  private readonly qualityMutex = new Mutex();

  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private microphoneProducer: Producer | null = null;
  private cameraProducer: Producer | null = null;
  private screenVideoProducer: Producer | null = null;
  private screenAudioProducer: Producer | null = null;
  private lastProducerScore: number | null = null;
  private activeBaseKbps: number | null = null;
  private activeLadder: TVoiceLadderEntry[] = [];
  private currentQualityLevel: TVoiceLadderEntry | null = null;
  private microphoneMuted = false;
  private readonly consuming = new Set<string>();
  private pendingConsumes: TVoiceRoomProduceResult[] = [];
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;
  private livenessState: TVoiceLivenessState | null = null;
  private isWatchdogTickRunning = false;

  public get microphoneProducerId(): string | null {
    return this.microphoneProducer?.id ?? null;
  }

  private get settingsStore(): InstanceType<typeof SettingsStore> {
    return this.injector.get(SettingsStore);
  }

  constructor() {
    this.cameraService.deviceChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        void this.switchCamera();
      });

    this.socket.on(
      EVoiceRoomEvent.PRODUCER_SCORE,
      (data: TVoiceRoomProducerScore) => {
        if (
          this.microphoneProducer &&
          !this.microphoneProducer.closed &&
          data.producerId === this.microphoneProducer.id
        ) {
          this.lastProducerScore = data.score;
        }
      },
    );
  }

  public setMicrophoneMuted(muted: boolean): void {
    this.microphoneMuted = muted;
    const track = this.microphoneProducer?.track;
    if (track) {
      track.enabled = !muted;
    }
  }

  public clearPendingConsumes(): void {
    this.pendingConsumes = [];
    this.consuming.clear();
  }

  public cleanup(): void {
    const micProducer = this.microphoneProducer;
    const camProducer = this.cameraProducer;
    const screenVideo = this.screenVideoProducer;
    const screenAudio = this.screenAudioProducer;
    const sendTransport = this.sendTransport;
    const recvTransport = this.recvTransport;
    this.microphoneProducer = null;
    this.cameraProducer = null;
    this.screenVideoProducer = null;
    this.screenAudioProducer = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.peerVideoService.clear();
    this.peerScreenAudioService.clear();
    this.cameraService.release();
    this.screenCaptureService.release();
    this.voiceQualityService.stop();
    this.lastProducerScore = null;
    this.activeBaseKbps = null;
    this.activeLadder = [];
    this.currentQualityLevel = null;
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    this.livenessState = null;
    this.voiceConnectionStore.resetTransports();
    this.voiceConnectionStore.setMicFailed(false);
    sendTransport?.close();
    recvTransport?.close();
    micProducer?.close();
    camProducer?.close();
    screenVideo?.close();
    screenAudio?.close();
  }

  /** Both transports exist and none is failed, disconnected or closed. */
  public transportsHealthy(): boolean {
    return [this.sendTransport, this.recvTransport].every(
      (transport) =>
        transport !== null &&
        !transport.closed &&
        !UNHEALTHY_TRANSPORT_STATES.has(transport.connectionState),
    );
  }

  /** Fresh ICE credentials from the server for every live transport. */
  public async restartIce(): Promise<void> {
    for (const transport of [this.sendTransport, this.recvTransport]) {
      if (!transport || transport.closed) {
        continue;
      }
      const payload: TVoiceRoomRestartIce = { transportId: transport.id };
      const { iceParameters }: TVoiceRoomRestartIceResult =
        await emitVoiceRoomWithAck(
          this.socket,
          EVoiceRoomEvent.RESTART_ICE,
          payload,
        );
      await transport.restartIce({
        iceParameters: iceParameters as IceParameters,
      });
    }
  }

  public produceCamera(): Promise<void> {
    return this.cameraMutex.runExclusive(() => this.produceCameraLocked());
  }

  public stopCamera(): Promise<void> {
    return this.cameraMutex.runExclusive(() => this.stopCameraLocked());
  }

  /**
   * Moves an active camera producer to the device that should be used now
   * (user choice, else first camera). Stops the camera when none can be opened.
   */
  public switchCamera(): Promise<void> {
    return this.cameraMutex.runExclusive(() => this.switchCameraLocked());
  }

  public produceScreen(): Promise<void> {
    return this.screenMutex.runExclusive(() => this.produceScreenLocked());
  }

  public stopScreen(): Promise<void> {
    return this.screenMutex.runExclusive(() => this.stopScreenLocked());
  }

  public produceMicrophone(): Promise<void> {
    return this.microphoneMutex.runExclusive(() =>
      this.produceMicrophoneLocked(),
    );
  }

  public replaceMicrophoneTrack(track: MediaStreamTrack): Promise<void> {
    return this.microphoneMutex.runExclusive(() =>
      this.replaceMicrophoneTrackLocked(track),
    );
  }

  private async produceMicrophoneLocked(): Promise<void> {
    const sendTransport = this.sendTransport;
    if (!sendTransport || sendTransport.closed) {
      return;
    }

    const previous = this.microphoneProducer;
    this.microphoneProducer = null;
    this.voiceQualityService.stop();
    previous?.close();

    try {
      const stream = await this.microphoneService.getStream();
      const track = stream.getAudioTracks()[0];
      if (!track) {
        throw new Error('Microphone stream has no audio track');
      }

      await waitForTrackUnmute(track);
      track.enabled = !this.microphoneMuted;

      const base = this.settingsStore.voiceMaxBitrateKbps();
      this.activeBaseKbps = base;
      this.activeLadder = buildVoiceLadder(base);
      this.currentQualityLevel = this.activeLadder[0];
      this.lastProducerScore = null;

      const producer = await sendTransport.produce({
        track,
        stopTracks: false,
        appData: { mediaTag: 'mic' },
        codecOptions: {
          opusStereo: false,
          opusFec: true,
          opusDtx: true,
          opusMaxPlaybackRate: 48000,
          opusMaxAverageBitrate: base * 1000,
          opusPtime: 20,
        },
        encodings: [
          {
            priority: 'high',
            networkPriority: 'high',
          },
        ],
      });
      if (producer.track) {
        producer.track.enabled = !this.microphoneMuted;
      }
      this.microphoneProducer = producer;
      this.voiceConnectionStore.setMicFailed(false);
      this.voiceQualityService.start(this.activeLadder, {
        readSample: () => this.readQualitySample(),
        applyQualityLevel: (entry) => this.applyQualityLevel(entry),
      });

      producer.on('trackended', () => {
        if (this.microphoneProducer !== producer) {
          return;
        }
        this.onProducerTrackEnded();
      });
    } catch (error) {
      this.voiceQualityService.stop();
      this.voiceConnectionStore.setMicFailed(true);
      notifyError(
        this.tuiNotificationService,
        this.translateService,
        'VOICE.MICROPHONE_FAILED',
        error,
      );
      console.error('Failed to produce microphone\n', error);
    }
  }

  private async replaceMicrophoneTrackLocked(
    track: MediaStreamTrack,
  ): Promise<void> {
    const producer = this.microphoneProducer;
    if (!producer || producer.closed) {
      return;
    }
    track.enabled = !this.microphoneMuted;
    if (producer.track === track) {
      return;
    }
    await producer.replaceTrack({ track });
  }

  private onProducerTrackEnded(): void {
    this.voiceQualityService.stop();
    const producer = this.microphoneProducer;
    this.microphoneProducer = null;
    if (producer && !producer.closed) {
      producer.close();
    }
    const reproduce = (): void => {
      if (!this.sendTransport || this.sendTransport.closed) {
        return;
      }
      void this.produceMicrophone();
    };
    if (this.microphoneMutex.isLocked()) {
      void this.microphoneMutex.waitForUnlock().then(reproduce);
      return;
    }
    reproduce();
  }

  private async produceCameraLocked(): Promise<void> {
    this.requireSendTransport();
    await this.loadDevice();
    await this.stopCameraLocked({ silent: true });

    try {
      const track = await this.cameraService.getTrack();
      this.peerVideoService.setLocalCamTrack(track);
      const producer = await this.produceVideo('cam', track);
      this.cameraProducer = producer;
      this.audioService.playStreamStartAudio();
      producer.on('trackended', () => {
        if (this.cameraProducer !== producer) {
          return;
        }
        void this.switchCamera();
      });
    } catch (error) {
      this.peerVideoService.setLocalCamTrack(null);
      this.cameraService.release();
      console.error('Failed to produce camera\n', error);
      throw error;
    }
  }

  private async switchCameraLocked(): Promise<void> {
    const producer = this.cameraProducer;
    if (!producer || producer.closed) {
      return;
    }
    const previousId = producer.track?.getSettings?.().deviceId ?? null;
    try {
      const track = await this.cameraService.getTrack();
      if (this.cameraProducer !== producer || producer.closed) {
        this.cameraService.release();
        return;
      }
      await producer.replaceTrack({ track });
      this.peerVideoService.setLocalCamTrack(track);
      const nextId = track.getSettings?.().deviceId ?? null;
      if (nextId !== previousId) {
        this.switchNotifier.notify('videoinput', track.label ?? '');
      }
    } catch (error) {
      console.warn('Failed to switch camera device', error);
      await this.stopCameraLocked();
    }
  }

  private async stopCameraLocked(options?: {
    silent?: boolean;
  }): Promise<void> {
    const producer = this.cameraProducer;
    this.cameraProducer = null;
    this.peerVideoService.setLocalCamTrack(null);
    if (producer && !producer.closed) {
      await this.closeProducerRemote(producer);
    }
    this.cameraService.release();
    if (producer && !options?.silent) {
      this.audioService.playStreamStopAudio();
    }
  }

  private async produceScreenLocked(): Promise<void> {
    const sendTransport = this.requireSendTransport();
    await this.loadDevice();
    await this.stopScreenLocked({ silent: true });

    try {
      const { videoTrack, audioTrack } =
        await this.screenCaptureService.getTracks();
      this.peerVideoService.setLocalScreenTrack(videoTrack);

      const videoProducer = await this.produceVideo('screen', videoTrack);
      this.screenVideoProducer = videoProducer;
      this.audioService.playStreamStartAudio();
      videoProducer.on('trackended', () => {
        if (this.screenVideoProducer !== videoProducer) {
          return;
        }
        void this.stopScreen();
      });

      if (audioTrack) {
        const base =
          this.activeBaseKbps ?? this.settingsStore.voiceMaxBitrateKbps();
        const audioProducer = await sendTransport.produce({
          track: audioTrack,
          stopTracks: false,
          appData: { mediaTag: 'screen-audio' },
          codecOptions: {
            opusStereo: false,
            opusFec: true,
            opusDtx: true,
            opusMaxPlaybackRate: 48000,
            opusMaxAverageBitrate: base * 1000,
            opusPtime: 20,
          },
          encodings: [
            {
              priority: 'medium',
              networkPriority: 'medium',
            },
          ],
        });
        if (
          this.currentQualityLevel &&
          this.currentQualityLevel.tier !== EVoiceQualityTier.EXCELLENT
        ) {
          void audioProducer
            .setRtpEncodingParameters({
              maxBitrate: this.currentQualityLevel.kbps * 1000,
            })
            .catch((err) =>
              console.warn('Failed to set screen audio bitrate', err),
            );
        }
        this.screenAudioProducer = audioProducer;
        audioProducer.on('trackended', () => {
          if (this.screenAudioProducer !== audioProducer) {
            return;
          }
          void this.closeProducerRemote(audioProducer).then(() => {
            if (this.screenAudioProducer === audioProducer) {
              this.screenAudioProducer = null;
            }
          });
        });
      }
    } catch (error) {
      await this.stopScreenLocked({ silent: true });
      console.error('Failed to produce screen\n', error);
      throw error;
    }
  }

  /**
   * Codec for a video producer. `tag` is the phase-4 hook for a per-stream
   * choice; camera and screen both use VP8 today.
   */
  private pickVideoCodec(tag: 'cam' | 'screen'): RtpCodecCapability {
    const device = this.device;
    if (!device) {
      throw new Error('mediasoup Device is not loaded');
    }
    const codec = device.rtpCapabilities.codecs?.find(
      (item) => item.mimeType.toLowerCase() === this.videoCodecMimeType(tag),
    );
    if (!codec) {
      throw new Error('VP8 codec is not available');
    }
    return codec;
  }

  private videoCodecMimeType(tag: 'cam' | 'screen'): string {
    switch (tag) {
      case 'cam':
      case 'screen':
        return 'video/vp8';
    }
  }

  private async produceVideo(
    tag: 'cam' | 'screen',
    track: MediaStreamTrack,
  ): Promise<Producer> {
    const sendTransport = this.requireSendTransport();
    await this.loadDevice();
    const codec = this.pickVideoCodec(tag);
    const producer = await sendTransport.produce({
      track,
      codec,
      stopTracks: false,
      appData: { mediaTag: tag },
      encodings: [
        {
          priority: 'low',
          networkPriority: 'low',
        },
      ],
    });

    const currentTier =
      this.currentQualityLevel?.tier ?? EVoiceQualityTier.EXCELLENT;
    if (currentTier === EVoiceQualityTier.BAD) {
      producer.pause();
    } else {
      const cap = VOICE_QUALITY_VIDEO_CAPS[currentTier];
      if (cap !== null && cap !== undefined) {
        await producer
          .setRtpEncodingParameters({ maxBitrate: cap })
          .catch((err) => console.warn('Failed to cap video bitrate', err));
      }
    }

    return producer;
  }

  private requireSendTransport(): Transport {
    const sendTransport = this.sendTransport;
    if (!sendTransport || sendTransport.closed) {
      throw new Error('Send transport is not ready');
    }
    return sendTransport;
  }

  private async stopScreenLocked(options?: {
    silent?: boolean;
  }): Promise<void> {
    const video = this.screenVideoProducer;
    const audio = this.screenAudioProducer;
    this.screenVideoProducer = null;
    this.screenAudioProducer = null;
    this.peerVideoService.setLocalScreenTrack(null);
    if (video && !video.closed) {
      await this.closeProducerRemote(video);
    }
    if (audio && !audio.closed) {
      await this.closeProducerRemote(audio);
    }
    this.screenCaptureService.release();
    if ((video || audio) && !options?.silent) {
      this.audioService.playStreamStopAudio();
    }
  }

  private async closeProducerRemote(producer: Producer): Promise<void> {
    try {
      await emitVoiceRoomWithAck(this.socket, EVoiceRoomEvent.CLOSE_PRODUCER, {
        producerId: producer.id,
      } satisfies TVoiceRoomCloseProducer);
    } catch (error) {
      console.warn('close-producer ack failed', error);
    }
    if (!producer.closed) {
      producer.close();
    }
  }

  public handleConsumerClosed(consumerId: string): void {
    this.peerVideoService.removeByConsumerId(consumerId);
    this.peerScreenAudioService.detachByConsumerId(consumerId);
  }

  public ensureDeviceLoaded(): Promise<void> {
    return this.sessionMutex.runExclusive(() => this.loadDevice());
  }

  public ensureSendTransport(): Promise<void> {
    return this.sessionMutex.runExclusive(() =>
      this.ensureSendTransportLocked(),
    );
  }

  public ensureRecvTransport(): Promise<void> {
    return this.sessionMutex.runExclusive(() =>
      this.ensureRecvTransportLocked(),
    );
  }

  public async applyQualityLevel(entry: TVoiceLadderEntry): Promise<void> {
    return this.qualityMutex.runExclusive(async () => {
      this.currentQualityLevel = entry;

      const audioMaxBitrate = entry.kbps * 1000;
      const mic = this.microphoneProducer;
      if (mic && !mic.closed) {
        await mic
          .setRtpEncodingParameters({ maxBitrate: audioMaxBitrate })
          .catch((err) => console.warn('Failed to set mic bitrate', err));
      }

      const screenAudio = this.screenAudioProducer;
      if (screenAudio && !screenAudio.closed) {
        await screenAudio
          .setRtpEncodingParameters({ maxBitrate: audioMaxBitrate })
          .catch((err) =>
            console.warn('Failed to set screen audio bitrate', err),
          );
      }

      const videoProducers = [
        this.cameraProducer,
        this.screenVideoProducer,
      ].filter((p): p is Producer => p !== null && !p.closed);

      if (entry.tier === EVoiceQualityTier.BAD) {
        for (const video of videoProducers) {
          if (!video.paused) {
            video.pause();
          }
        }
      } else {
        const cap = VOICE_QUALITY_VIDEO_CAPS[entry.tier];
        for (const video of videoProducers) {
          if (video.paused) {
            video.resume();
          }
          await video
            .setRtpEncodingParameters({ maxBitrate: cap ?? undefined })
            .catch((err) => console.warn('Failed to set video bitrate', err));
        }
      }
    });
  }

  public async readQualitySample(): Promise<TVoiceQualitySample> {
    const producer = this.microphoneProducer;
    let loss: number | null = null;
    let rttMs: number | null = null;
    let jitterMs: number | null = null;

    if (producer && !producer.closed) {
      try {
        const stats = await producer.getStats();
        for (const report of stats.values()) {
          if (report.type === 'remote-inbound-rtp') {
            if (typeof report.fractionLost === 'number') {
              loss = Math.max(0, report.fractionLost * 100);
            }
            if (typeof report.roundTripTime === 'number') {
              rttMs = Math.round(report.roundTripTime * 1000);
            }
            if (typeof report.jitter === 'number') {
              jitterMs = Math.round(report.jitter * 1000);
            }
            break;
          }
        }
      } catch {
        // Stats read failed or producer was closed during query
      }
    }

    return {
      score: this.lastProducerScore,
      loss,
      rttMs,
      jitterMs,
    };
  }

  private async ensureSendTransportLocked(): Promise<void> {
    if (this.sendTransport) {
      return;
    }
    this.sendTransport = await this.createTransport('send');
    await this.produceMicrophone();
  }

  private async ensureRecvTransportLocked(): Promise<void> {
    if (this.recvTransport) {
      return;
    }
    this.recvTransport = await this.createTransport('recv');
  }

  private async createTransport(
    direction: 'send' | 'recv',
  ): Promise<Transport> {
    await this.loadDevice();
    const device = this.device;
    if (!device) {
      throw new Error('mediasoup Device is not loaded');
    }

    const result: TVoiceRoomCreateTransportResult = await emitVoiceRoomWithAck(
      this.socket,
      EVoiceRoomEvent.CREATE_TRANSPORT,
      {
        direction,
      } satisfies TVoiceRoomCreateTransport,
      VOICE_JOIN_ACK_MS,
    );

    const iceServers = this.settingsStore.iceServers();
    const options = {
      ...(result as unknown as TransportOptions),
      iceServers:
        iceServers.length > 0 ? (iceServers as RTCIceServer[]) : undefined,
    };

    const transport =
      direction === 'send'
        ? device.createSendTransport(options)
        : device.createRecvTransport(options);

    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await emitVoiceRoomWithAck(
          this.socket,
          EVoiceRoomEvent.CONNECT_TRANSPORT,
          {
            transportId: transport.id,
            dtlsParameters,
          } satisfies TVoiceRoomConnectTransport,
        );
        callback();
      } catch (err) {
        errback(err as Error);
      }
    });

    if (direction === 'send') {
      transport.on(
        'produce',
        async ({ kind, rtpParameters, appData }, callback, errback) => {
          const producePayload: TVoiceRoomProduce = {
            kind,
            rtpParameters,
            transportId: transport.id,
            mediaTag: appData['mediaTag'] as TVoiceRoomMediaTag,
          };

          try {
            const res: TVoiceRoomProduceResult = await emitVoiceRoomWithAck(
              this.socket,
              EVoiceRoomEvent.PRODUCE,
              producePayload,
              VOICE_JOIN_ACK_MS,
            );
            callback({ id: res.producerId });
          } catch (error) {
            if (isVoiceSocketAckTimeout(error)) {
              try {
                const retryRes: TVoiceRoomProduceResult =
                  await emitVoiceRoomWithAck(
                    this.socket,
                    EVoiceRoomEvent.PRODUCE,
                    producePayload,
                    VOICE_JOIN_ACK_MS,
                  );
                callback({ id: retryRes.producerId });
                return;
              } catch (retryError) {
                errback(retryError as Error);
                return;
              }
            }
            errback(error as Error);
          }
        },
      );
    }

    this.voiceConnectionStore.setTransportState(
      direction,
      transport.connectionState as TVoiceTransportState,
    );
    this.startWatchdog();

    transport.on('connectionstatechange', (state) => {
      this.voiceConnectionStore.setTransportState(
        direction,
        state as TVoiceTransportState,
      );
      if (state !== 'failed') {
        return;
      }
      if (direction === 'send' && this.sendTransport === transport) {
        this.sendTransport = null;
      }
      if (direction === 'recv' && this.recvTransport === transport) {
        this.recvTransport = null;
      }
    });

    return transport;
  }

  public consumePending(
    resolvePeer: (userId: number) => IConsumePeerContext | null,
  ): Promise<void> {
    return this.consumeMutex.runExclusive(() => this.drainPending(resolvePeer));
  }

  /** Only called while `consumeMutex` is held. */

  private async drainPending(
    resolvePeer: (userId: number) => IConsumePeerContext | null,
  ): Promise<void> {
    const pendingConsumes = [...this.pendingConsumes];
    this.pendingConsumes = [];
    await Promise.all(
      pendingConsumes.map((item) => this.consume(item, resolvePeer)),
    );
  }

  public async consume(
    data: TVoiceRoomProduceResult,
    resolvePeer: (userId: number) => IConsumePeerContext | null,
  ): Promise<void> {
    // Screen is opt-in: register availability, do not auto-consume.
    if (data.mediaTag === 'screen') {
      this.peerVideoService.registerAvailableScreen(
        data.userId,
        data.producerId,
        'video',
      );
      return;
    }
    if (data.mediaTag === 'screen-audio') {
      this.peerVideoService.registerAvailableScreen(
        data.userId,
        data.producerId,
        'audio',
      );
      return;
    }

    await this.consumeProducer(data, resolvePeer);
  }

  public async consumeProducer(
    data: TVoiceRoomProduceResult,
    resolvePeer: (userId: number) => IConsumePeerContext | null,
    options?: { screenGain?: number; rethrow?: boolean },
  ): Promise<void> {
    if (this.consuming.has(data.producerId)) {
      console.warn('Producer already consuming\n', data);
      return;
    }
    this.consuming.add(data.producerId);

    try {
      await this.ensureRecvTransport();

      const peer = resolvePeer(data.userId);
      if (!peer) {
        if (options?.rethrow) {
          throw new Error('Peer not found');
        }
        console.warn(
          'Peer not found while consuming\n',
          data,
          '\nAdded to pending consumes',
        );
        this.pendingConsumes.push(data);
        return;
      }

      const device = this.device;
      const recvTransport = this.recvTransport;
      if (!device || !recvTransport) {
        throw new Error('Recv transport is not ready');
      }

      const result: TVoiceRoomConsumeResult = await emitVoiceRoomWithAck(
        this.socket,
        EVoiceRoomEvent.CONSUME,
        {
          producerId: data.producerId,
          rtpCapabilities: device.recvRtpCapabilities,
          transportId: recvTransport.id,
        } satisfies TVoiceRoomConsume,
      );

      const consumer = await recvTransport.consume(
        result as unknown as ConsumerOptions,
      );

      if (data.mediaTag === 'screen') {
        this.consumerRegistry.add(consumer);
        this.peerVideoService.attach(data.userId, {
          producerId: consumer.producerId,
          consumerId: consumer.id,
          track: consumer.track,
          mediaTag: 'screen',
        });
        consumer.resume();
        return;
      }

      if (data.mediaTag === 'screen-audio') {
        await this.peerScreenAudioService.attach(data.userId, consumer, {
          gain: options?.screenGain ?? 1,
          speakerMuted: peer.speakerMuted,
        });
        consumer.resume();
        return;
      }

      if (data.kind === 'video' || data.mediaTag === 'cam') {
        this.consumerRegistry.add(consumer);
        this.peerVideoService.attach(data.userId, {
          producerId: consumer.producerId,
          consumerId: consumer.id,
          track: consumer.track,
          mediaTag: 'cam',
        });
        consumer.resume();
        return;
      }

      await this.peerPlaybackService.attach(data.userId, consumer, peer);
      consumer.resume();
    } catch (error) {
      console.error('Error while consuming', data, error);
      if (options?.rethrow) {
        throw error;
      }
    } finally {
      this.consuming.delete(data.producerId);
    }
  }

  private async loadDevice(): Promise<void> {
    if (!this.device) {
      const mediasoupClient = await import('mediasoup-client');
      const DeviceCtor =
        mediasoupClient.Device ??
        (
          mediasoupClient as unknown as {
            default: { Device: typeof import('mediasoup-client').Device };
          }
        ).default?.Device;
      if (typeof DeviceCtor !== 'function') {
        console.error(
          'mediasoup-client Device is not a constructor',
          mediasoupClient,
        );
        throw new Error('Failed to load mediasoup-client Device');
      }
      this.device = new DeviceCtor();
    }
    if (this.device.loaded) {
      return;
    }
    const routerRtpCapabilities = await emitVoiceRoomWithAck(
      this.socket,
      EVoiceRoomEvent.GET_RTP_CAPABILITIES,
    );
    await this.device.load({
      routerRtpCapabilities:
        routerRtpCapabilities as unknown as RtpCapabilities,
    });
  }

  private startWatchdog(): void {
    if (this.watchdogInterval) {
      return;
    }
    this.livenessState = createInitialVoiceLiveness(Date.now());
    this.watchdogInterval = setInterval(() => {
      void this.onWatchdogTick();
    }, VOICE_WATCHDOG_INTERVAL_MS);
  }

  private async onWatchdogTick(): Promise<void> {
    if (this.isWatchdogTickRunning || !this.watchdogInterval) {
      return;
    }
    this.isWatchdogTickRunning = true;
    try {
      const sendBytes = await readTransportBytes(this.sendTransport);
      const recvBytes = await readTransportBytes(this.recvTransport);

      if (!this.watchdogInterval) {
        return;
      }

      const previousLiveness =
        this.livenessState ?? createInitialVoiceLiveness(Date.now());
      const now = Date.now();
      const sendConnected = this.sendTransport?.connectionState === 'connected';
      const recvConnected = this.recvTransport?.connectionState === 'connected';

      const { state, stalled } = advanceVoiceLiveness(
        previousLiveness,
        {
          sendBytes,
          recvBytes,
          sendConnected,
          recvConnected,
        },
        now,
      );

      this.livenessState = state;
      this.voiceConnectionStore.setStalled(stalled);
    } finally {
      this.isWatchdogTickRunning = false;
    }
  }
}

async function readTransportBytes(
  transport: Transport | null,
): Promise<number | null> {
  if (!transport || transport.closed) {
    return null;
  }
  try {
    const stats = await transport.getStats();
    let totalBytes: number | null = null;
    for (const report of stats.values()) {
      if (report.type === 'candidate-pair' && report.nominated === true) {
        const sent =
          typeof report.bytesSent === 'number' ? report.bytesSent : 0;
        const recv =
          typeof report.bytesReceived === 'number' ? report.bytesReceived : 0;
        totalBytes = (totalBytes ?? 0) + sent + recv;
      }
    }
    return totalBytes;
  } catch {
    return null;
  }
}

const TRACK_UNMUTE_TIMEOUT_MS = 2000;
const UNHEALTHY_TRANSPORT_STATES: ReadonlySet<string> = new Set([
  'failed',
  'disconnected',
  'closed',
]);

function waitForTrackUnmute(track: MediaStreamTrack): Promise<void> {
  if (track.readyState !== 'live' || !track.muted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = () => {
      track.removeEventListener('unmute', finish);
      globalThis.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = globalThis.setTimeout(finish, TRACK_UNMUTE_TIMEOUT_MS);
    track.addEventListener('unmute', finish);
    if (!track.muted) {
      finish();
    }
  });
}
