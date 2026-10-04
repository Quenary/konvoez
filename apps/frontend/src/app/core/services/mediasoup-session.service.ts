import { inject, Injectable, Injector } from '@angular/core';
import {
  EVoiceRoomEvent,
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
import { PeerPlaybackService } from './peer-playback.service';

const mediasoupMutex = new Mutex();

export interface IConsumePeerContext {
  gain: number;
  speakerMuted: boolean;
}

/**
 * Mediasoup-client Device, send/recv transports, mic produce, and remote consume.
 * Pending consumes wait until the peer exists in VoiceRoomStore.
 */
@Injectable({
  providedIn: 'root',
})
export class MediasoupSessionService {
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly injector = inject(Injector);
  private readonly microphoneService = inject(MicrophoneService);
  private readonly peerPlaybackService = inject(PeerPlaybackService);

  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private microphoneProducer: Producer | null = null;
  private readonly consuming = new Set<string>();
  private pendingConsumes: IVoiceRoomProduceResult[] = [];

  private get settingsStore(): InstanceType<typeof SettingsStore> {
    return this.injector.get(SettingsStore);
  }

  public setMicrophoneMuted(muted: boolean): void {
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
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.microphoneProducer?.close();

    this.sendTransport = null;
    this.recvTransport = null;
    this.microphoneProducer = null;
  }

  public async produceMicrophone(muted: boolean): Promise<void> {
    if (!this.sendTransport) {
      return;
    }

    if (this.microphoneProducer) {
      this.microphoneProducer.close();
      this.microphoneProducer = null;
    }

    try {
      const stream = await this.microphoneService.getStream();
      const track = stream.getAudioTracks()[0];
      track.enabled = !muted;
      this.microphoneProducer = await this.sendTransport.produce({
        track,
        appData: { mediaTag: 'mic' },
      });
    } catch (error) {
      console.error('Failed to produce microphone\n', error);
    }
  }

  @Mutexed(mediasoupMutex)
  public async ensureDeviceLoaded(): Promise<void> {
    await this.loadDevice();
  }

  @Mutexed(mediasoupMutex)
  public async ensureSendTransport(muted: boolean): Promise<void> {
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

    await this.produceMicrophone(muted);
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
