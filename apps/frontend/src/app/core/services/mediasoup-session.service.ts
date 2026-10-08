import { inject, Injectable, Injector } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EVoiceRoomEvent,
  IVoiceRoomCloseProducer,
  IVoiceRoomConnectTransport,
  IVoiceRoomConsume,
  IVoiceRoomConsumeResult,
  IVoiceRoomCreateTransport,
  IVoiceRoomCreateTransportResult,
  IVoiceRoomProduce,
  IVoiceRoomProduceResult,
  TVoiceRoomMediaTag,
} from '@konvoez/shared';
import { Mutex } from 'async-mutex';
import type { Device } from 'mediasoup-client';
import type {
  ConsumerOptions,
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
import { CameraService } from './camera.service';
import { ScreenCaptureService } from './screen-capture.service';
import { PeerPlaybackService } from './peer-playback.service';
import { PeerScreenAudioService } from './peer-screen-audio.service';
import { ConsumerRegistry } from './consumer-registry';
import { PeerVideoService } from './peer-video.service';

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
  private readonly microphoneService = inject(MicrophoneService);
  private readonly cameraService = inject(CameraService);
  private readonly screenCaptureService = inject(ScreenCaptureService);
  private readonly peerPlaybackService = inject(PeerPlaybackService);
  private readonly peerScreenAudioService = inject(PeerScreenAudioService);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly consumerRegistry = inject(ConsumerRegistry);

  private readonly sessionMutex = new Mutex();
  private readonly microphoneMutex = new Mutex();
  private readonly cameraMutex = new Mutex();
  private readonly screenMutex = new Mutex();
  private readonly consumeMutex = new Mutex();

  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private microphoneProducer: Producer | null = null;
  private cameraProducer: Producer | null = null;
  private screenVideoProducer: Producer | null = null;
  private screenAudioProducer: Producer | null = null;
  private microphoneMuted = false;
  private readonly consuming = new Set<string>();
  private pendingConsumes: IVoiceRoomProduceResult[] = [];

  private get settingsStore(): InstanceType<typeof SettingsStore> {
    return this.injector.get(SettingsStore);
  }

  constructor() {
    this.cameraService.deviceLost$.pipe(takeUntilDestroyed()).subscribe(() => {
      void this.stopCamera();
    });
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
    sendTransport?.close();
    recvTransport?.close();
    micProducer?.close();
    camProducer?.close();
    screenVideo?.close();
    screenAudio?.close();
  }

  public produceCamera(): Promise<void> {
    return this.cameraMutex.runExclusive(() => this.produceCameraLocked());
  }

  public stopCamera(): Promise<void> {
    return this.cameraMutex.runExclusive(() => this.stopCameraLocked());
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
    previous?.close();

    try {
      const stream = await this.microphoneService.getStream();
      const track = stream.getAudioTracks()[0];
      if (!track) {
        throw new Error('Microphone stream has no audio track');
      }

      await waitForTrackUnmute(track);
      track.enabled = !this.microphoneMuted;
      const producer = await sendTransport.produce({
        track,
        stopTracks: false,
        appData: { mediaTag: 'mic' },
      });
      if (producer.track) {
        producer.track.enabled = !this.microphoneMuted;
      }
      this.microphoneProducer = producer;
      producer.on('trackended', () => {
        if (this.microphoneProducer !== producer) {
          return;
        }
        this.onProducerTrackEnded();
      });
    } catch (error) {
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
    await this.stopCameraLocked();

    try {
      const track = await this.cameraService.getTrack();
      this.peerVideoService.setLocalCamTrack(track);
      const producer = await this.produceVideo('cam', track);
      this.cameraProducer = producer;
      producer.on('trackended', () => {
        if (this.cameraProducer !== producer) {
          return;
        }
        void this.stopCamera();
      });
    } catch (error) {
      this.peerVideoService.setLocalCamTrack(null);
      this.cameraService.release();
      console.error('Failed to produce camera\n', error);
      throw error;
    }
  }

  private async stopCameraLocked(): Promise<void> {
    const producer = this.cameraProducer;
    this.cameraProducer = null;
    this.peerVideoService.setLocalCamTrack(null);
    if (producer && !producer.closed) {
      await this.closeProducerRemote(producer);
    }
    this.cameraService.release();
  }

  private async produceScreenLocked(): Promise<void> {
    const sendTransport = this.requireSendTransport();
    await this.loadDevice();
    await this.stopScreenLocked();

    try {
      const { videoTrack, audioTrack } =
        await this.screenCaptureService.getTracks();
      this.peerVideoService.setLocalScreenTrack(videoTrack);

      const videoProducer = await this.produceVideo('screen', videoTrack);
      this.screenVideoProducer = videoProducer;
      videoProducer.on('trackended', () => {
        if (this.screenVideoProducer !== videoProducer) {
          return;
        }
        void this.stopScreen();
      });

      if (audioTrack) {
        const audioProducer = await sendTransport.produce({
          track: audioTrack,
          stopTracks: false,
          appData: { mediaTag: 'screen-audio' },
        });
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
      await this.stopScreenLocked();
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
    return sendTransport.produce({
      track,
      codec,
      stopTracks: false,
      appData: { mediaTag: tag },
    });
  }

  private requireSendTransport(): Transport {
    const sendTransport = this.sendTransport;
    if (!sendTransport || sendTransport.closed) {
      throw new Error('Send transport is not ready');
    }
    return sendTransport;
  }

  private async stopScreenLocked(): Promise<void> {
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
  }

  private async closeProducerRemote(producer: Producer): Promise<void> {
    try {
      await emitVoiceRoomWithAck(this.socket, EVoiceRoomEvent.CLOSE_PRODUCER, {
        producerId: producer.id,
      } satisfies IVoiceRoomCloseProducer);
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

    const result: IVoiceRoomCreateTransportResult = await emitVoiceRoomWithAck(
      this.socket,
      EVoiceRoomEvent.CREATE_TRANSPORT,
      {
        direction,
      } satisfies IVoiceRoomCreateTransport,
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
          } satisfies IVoiceRoomConnectTransport,
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
          const producePayload: IVoiceRoomProduce = {
            kind,
            rtpParameters,
            transportId: transport.id,
            mediaTag: appData['mediaTag'] as TVoiceRoomMediaTag,
          };

          try {
            const res: IVoiceRoomProduceResult = await emitVoiceRoomWithAck(
              this.socket,
              EVoiceRoomEvent.PRODUCE,
              producePayload,
              VOICE_JOIN_ACK_MS,
            );
            callback({ id: res.producerId });
          } catch (error) {
            if (isVoiceSocketAckTimeout(error)) {
              try {
                const retryRes: IVoiceRoomProduceResult =
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

    transport.on('connectionstatechange', (state) => {
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
    data: IVoiceRoomProduceResult,
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
    data: IVoiceRoomProduceResult,
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

      const result: IVoiceRoomConsumeResult = await emitVoiceRoomWithAck(
        this.socket,
        EVoiceRoomEvent.CONSUME,
        {
          producerId: data.producerId,
          rtpCapabilities: device.recvRtpCapabilities,
          transportId: recvTransport.id,
        } satisfies IVoiceRoomConsume,
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
}

const TRACK_UNMUTE_TIMEOUT_MS = 2000;

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
