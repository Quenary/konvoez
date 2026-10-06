import { inject, Injectable, Injector } from '@angular/core';
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
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { Mutex } from 'async-mutex';
import type { Device } from 'mediasoup-client';
import type {
  ConsumerOptions,
  Producer,
  RtpCapabilities,
  Transport,
  TransportOptions,
} from 'mediasoup-client/types';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { SettingsStore } from '@features/settings/settings.store';
import { MicrophoneService } from './microphone.service';
import { CameraService } from './camera.service';
import { PeerPlaybackService } from './peer-playback.service';
import { PeerVideoService } from './peer-video.service';

const mediasoupMutex = new Mutex();
const microphoneProducerMutex = new Mutex();
const cameraProducerMutex = new Mutex();

export interface IConsumePeerContext {
  gain: number;
  speakerMuted: boolean;
}

/**
 * Mediasoup-client Device, send/recv transports, mic/cam produce, and remote consume.
 * Pending consumes wait until the peer exists in VoiceRoomStore.
 */
@Injectable({
  providedIn: 'root',
})
export class MediasoupSessionService {
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly injector = inject(Injector);
  private readonly microphoneService = inject(MicrophoneService);
  private readonly cameraService = inject(CameraService);
  private readonly peerPlaybackService = inject(PeerPlaybackService);
  private readonly peerVideoService = inject(PeerVideoService);

  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private microphoneProducer: Producer | null = null;
  private cameraProducer: Producer | null = null;
  private microphoneMuted = false;
  private readonly consuming = new Set<string>();
  private pendingConsumes: IVoiceRoomProduceResult[] = [];

  private get settingsStore(): InstanceType<typeof SettingsStore> {
    return this.injector.get(SettingsStore);
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
    const sendTransport = this.sendTransport;
    const recvTransport = this.recvTransport;
    this.microphoneProducer = null;
    this.cameraProducer = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.peerVideoService.clear();
    this.cameraService.release();
    sendTransport?.close();
    recvTransport?.close();
    micProducer?.close();
    camProducer?.close();
  }

  public isCameraActive(): boolean {
    return Boolean(this.cameraProducer && !this.cameraProducer.closed);
  }

  public produceCamera(): Promise<void> {
    return cameraProducerMutex.runExclusive(() => this.produceCameraLocked());
  }

  public stopCamera(): Promise<void> {
    return cameraProducerMutex.runExclusive(() => this.stopCameraLocked());
  }

  public produceMicrophone(): Promise<void> {
    return microphoneProducerMutex.runExclusive(() =>
      this.produceMicrophoneLocked(),
    );
  }

  public replaceMicrophoneTrack(track: MediaStreamTrack): Promise<void> {
    return microphoneProducerMutex.runExclusive(() =>
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
    if (microphoneProducerMutex.isLocked()) {
      void microphoneProducerMutex.waitForUnlock().then(reproduce);
      return;
    }
    reproduce();
  }

  private async produceCameraLocked(): Promise<void> {
    const sendTransport = this.sendTransport;
    if (!sendTransport || sendTransport.closed) {
      throw new Error('Send transport is not ready');
    }
    await this.loadDevice();
    const device = this.device;
    if (!device) {
      throw new Error('mediasoup Device is not loaded');
    }

    const vp8 = device.rtpCapabilities.codecs?.find(
      (codec) => codec.mimeType.toLowerCase() === 'video/vp8',
    );
    if (!vp8) {
      throw new Error('VP8 codec is not available');
    }

    await this.stopCameraLocked();

    try {
      const track = await this.cameraService.getTrack();
      this.peerVideoService.setLocalTrack(track);
      const producer = await sendTransport.produce({
        track,
        codec: vp8,
        stopTracks: false,
        appData: { mediaTag: 'cam' },
      });
      this.cameraProducer = producer;
      producer.on('trackended', () => {
        if (this.cameraProducer !== producer) {
          return;
        }
        void this.stopCamera();
      });
    } catch (error) {
      this.peerVideoService.setLocalTrack(null);
      this.cameraService.release();
      console.error('Failed to produce camera\n', error);
      throw error;
    }
  }

  private async stopCameraLocked(): Promise<void> {
    const producer = this.cameraProducer;
    this.cameraProducer = null;
    this.peerVideoService.setLocalTrack(null);
    if (producer && !producer.closed) {
      const producerId = producer.id;
      try {
        await this.socket.emitWithAck(EVoiceRoomEvent.CLOSE_PRODUCER, {
          producerId,
        } satisfies IVoiceRoomCloseProducer);
      } catch (error) {
        console.warn('close-producer ack failed', error);
      }
      producer.close();
    }
    this.cameraService.release();
  }

  @Mutexed(mediasoupMutex)
  public async ensureDeviceLoaded(): Promise<void> {
    await this.loadDevice();
  }

  @Mutexed(mediasoupMutex)
  public async ensureSendTransport(): Promise<void> {
    if (this.sendTransport) {
      return;
    }

    await this.loadDevice();

    const result: IVoiceRoomCreateTransportResult =
      await this.socket.emitWithAck(EVoiceRoomEvent.CREATE_TRANSPORT, {
        direction: 'send',
      } satisfies IVoiceRoomCreateTransport);

    const iceServers = this.settingsStore.iceServers();
    const device = this.device;
    if (!device) {
      throw new Error('mediasoup Device is not loaded');
    }

    const sendTransport = device.createSendTransport({
      ...(result as unknown as TransportOptions),
      iceServers:
        iceServers.length > 0 ? (iceServers as RTCIceServer[]) : undefined,
    });
    this.sendTransport = sendTransport;

    sendTransport.on(
      'connect',
      async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.socket.emitWithAck(EVoiceRoomEvent.CONNECT_TRANSPORT, {
            transportId: sendTransport.id,
            dtlsParameters,
          } satisfies IVoiceRoomConnectTransport);
          callback();
        } catch (err) {
          errback(err as Error);
        }
      },
    );

    sendTransport.on(
      'produce',
      async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          const res: IVoiceRoomProduceResult = await this.socket.emitWithAck(
            EVoiceRoomEvent.PRODUCE,
            {
              kind,
              rtpParameters,
              transportId: sendTransport.id,
              mediaTag: appData['mediaTag'] as TVoiceRoomMediaTag,
            } satisfies IVoiceRoomProduce,
          );
          callback({ id: res.producerId });
        } catch (error) {
          errback(error as Error);
        }
      },
    );

    sendTransport.on('connectionstatechange', (state) => {
      if (state === 'failed') {
        this.sendTransport = null;
      }
    });

    await this.produceMicrophone();
  }

  @Mutexed(mediasoupMutex)
  public async ensureRecvTransport(): Promise<void> {
    if (this.recvTransport) {
      return;
    }

    await this.loadDevice();

    const result: IVoiceRoomCreateTransportResult =
      await this.socket.emitWithAck(EVoiceRoomEvent.CREATE_TRANSPORT, {
        direction: 'recv',
      } satisfies IVoiceRoomCreateTransport);

    const iceServers = this.settingsStore.iceServers();
    const device = this.device;
    if (!device) {
      throw new Error('mediasoup Device is not loaded');
    }

    const recvTransport = device.createRecvTransport({
      ...(result as unknown as TransportOptions),
      iceServers:
        iceServers.length > 0 ? (iceServers as RTCIceServer[]) : undefined,
    });
    this.recvTransport = recvTransport;

    recvTransport.on(
      'connect',
      async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.socket.emitWithAck(EVoiceRoomEvent.CONNECT_TRANSPORT, {
            transportId: recvTransport.id,
            dtlsParameters,
          } satisfies IVoiceRoomConnectTransport);
          callback();
        } catch (err) {
          errback(err as Error);
        }
      },
    );

    recvTransport.on('connectionstatechange', (state) => {
      if (state === 'failed') {
        this.recvTransport = null;
      }
    });
  }

  @Mutexed()
  public async consumePending(
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
    // Phase 1: auto-subscribe cam only; screen waits for opt-in (phase 2).
    if (data.mediaTag === 'screen' || data.mediaTag === 'screen-audio') {
      return;
    }

    if (this.consuming.has(data.producerId)) {
      console.warn('Producer already consuming\n', data);
      return;
    }
    this.consuming.add(data.producerId);

    try {
      await this.ensureRecvTransport();

      const peer = resolvePeer(data.userId);
      if (!peer) {
        console.warn(
          'Peer not found while consuming\n',
          data,
          '\nAdded to pending consumes',
        );
        this.pendingConsumes.push(data);
        if (resolvePeer(data.userId)) {
          await this.consumePending(resolvePeer);
        }
        return;
      }

      const device = this.device;
      const recvTransport = this.recvTransport;
      if (!device || !recvTransport) {
        throw new Error('Recv transport is not ready');
      }

      const result: IVoiceRoomConsumeResult = await this.socket.emitWithAck(
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

      if (data.kind === 'video' || data.mediaTag === 'cam') {
        this.peerVideoService.attach(data.userId, consumer, 'cam');
        consumer.resume();
        return;
      }

      await this.peerPlaybackService.attach(data.userId, consumer, peer);
      consumer.resume();
    } catch (error) {
      console.error('Error while consuming', data, error);
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
    const routerRtpCapabilities = await this.socket.emitWithAck(
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
