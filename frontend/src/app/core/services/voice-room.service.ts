import { inject, Injectable, signal } from '@angular/core';
import { VoiceRoomCommon } from '@common/voice-room';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { MicrophoneService } from './microphone.service';
import { SpeakerService } from './speaker.service';
import { EStorageKey } from '@app/app.enums';
import { Device } from 'mediasoup-client';
import { Consumer, Producer, Transport } from 'mediasoup-client/types';
import { UserCommon } from '@common/user';

interface IManagedPeer extends UserCommon.IUser {
  consumers: {
    producerId: string;
    consumer: Consumer;
  }[];
  sourceNode: MediaStreamAudioSourceNode | null;
  gainNode: GainNode | null;
  analyserNode: AnalyserNode | null;
  _audioEl: HTMLAudioElement | null;
}

/**
 * Helper service for active voice room
 */
@Injectable({
  providedIn: 'root',
})
export class VoiceRoomService {
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly microphoneService = inject(MicrophoneService);
  private readonly speakerService = inject(SpeakerService);

  private readonly device = new Device();
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private microphoneProducer: Producer | null = null;

  private readonly _microphoneMuted = signal<boolean>(false);
  public readonly microphoneMuted = this._microphoneMuted.asReadonly();
  private readonly _soundMuted = signal<boolean>(false);
  public readonly soundMuted = this._soundMuted.asReadonly();

  /**
   * Map user id to data
   */
  private readonly _peers = signal<
    Readonly<Record<number, Readonly<IManagedPeer>>>
  >({});
  /***
   * Map user id to data
   */
  public readonly peers = this._peers.asReadonly();
  /**
   * Map user id to gain level
   */
  private readonly _peerGainLevels = signal<Readonly<Record<number, number>>>(
    localStorage.getItemJson(EStorageKey.PEER_GAIN_LEVELS) ?? {},
  );
  /**
   * Map user id to gain level
   */
  public readonly peerGainLevels = this._peerGainLevels.asReadonly();

  /**
   * Initialize active room service
   *
   * Call it after authorization
   */
  async init() {
    await this.updateRtpCapabilities();

    console.log('Can produce video', this.device.canProduce('video'));
    console.log('Can produce audio', this.device.canProduce('audio'));

    // Существующие пиры при подключении
    this.socket.on(
      VoiceRoomCommon.EEvent.EXISTING_PEERS_ON_JOIN,
      async (data) => {
        this._peers.set(
          Object.fromEntries(
            data.users.map((u) => [
              u.id,
              {
                ...u,
                sourceNode: null,
                gainNode: null,
                analyserNode: null,
                _audioEl: null,
                consumers: [],
              },
            ]),
          ),
        );

        for (const u of data.users) {
          for (const p of u.producers) {
            await this.consume(p);
          }
        }
      },
    );

    // Подключение нового пира
    this.socket.on(VoiceRoomCommon.EEvent.PEER_JOINED, (data) => {
      this._peers.update((peers) => ({
        ...peers,
        [data.user.id]: {
          ...data.user,
          sourceNode: null,
          gainNode: null,
          analyserNode: null,
          _audioEl: null,
          consumers: [],
        },
      }));
    });

    // Отключение пира
    this.socket.on(VoiceRoomCommon.EEvent.PEER_LEFT, (data) => {
      const peer = this.peers()[data.user.id];
      if (peer) {
        this.cleanupPeer(peer);
        this._peers.update((peers) => {
          const { [peer.id]: _, ...rest } = peers;
          return rest;
        });
      }
    });

    // Событие при создании нового продюсера
    this.socket.on(VoiceRoomCommon.EEvent.PRODUCER_CREATED, async (data) => {
      await this.consume(data);
    });

    this.socket.on(VoiceRoomCommon.EEvent.PRODUCER_CLOSED, (data) => {
      const peer = this._peers()[data.userId];
      if (!peer) return;

      const consumer = peer.consumers.find(
        (c) => c.producerId === data.producerId,
      );
      if (!consumer) return;

      consumer.consumer.close();

      this._peers.update((peers) => ({
        ...peers,
        [peer.id]: {
          ...peer,
          consumers: peer.consumers.filter(
            (c) => c.producerId !== data.producerId,
          ),
        },
      }));
    });
  }

  public async joinRoom(roomId: number) {
    this.cleanupAllPeers();
    await this.socket.emitWithAck(VoiceRoomCommon.EEvent.JOIN_ROOM, {
      roomId,
    } satisfies VoiceRoomCommon.IJoinRoom);
  }

  public async leaveRoom() {
    await this.socket.emitWithAck(VoiceRoomCommon.EEvent.LEAVE_ROOM);
    this.cleanupAllPeers();
  }

  protected cleanupAllPeers(): void {
    const peers = this.peers();
    for (const p of Object.values(peers)) {
      this.cleanupPeer(p);
    }
    this._peers.set({});
  }

  protected cleanupPeer(peer: IManagedPeer): void {
    peer.sourceNode?.disconnect?.();
    peer.gainNode?.disconnect?.();
    peer.analyserNode?.disconnect?.();
    peer._audioEl?.remove();
    peer.consumers.forEach((c) => {
      c.consumer.close();
    });
  }

  async updateRtpCapabilities() {
    const routerRtpCapabilities = await this.socket.emitWithAck(
      VoiceRoomCommon.EEvent.GET_RTP_CAPABILITIES,
    );
    this.device.load({ routerRtpCapabilities });
  }

  async consume(data: VoiceRoomCommon.IProduceResult) {
    await this.ensureRecvTransport();

    const peer = this.peers()[data.userId];

    if (!peer) {
      console.warn('Peer not found for consume', data);
      return;
    }

    if (peer.consumers.some((c) => c.producerId === data.producerId)) {
      return;
    }

    const result: VoiceRoomCommon.IConsumeResult =
      await this.socket.emitWithAck(VoiceRoomCommon.EEvent.CONSUME, {
        producerId: data.producerId,
        rtpCapabilities: this.device.recvRtpCapabilities,
        transportId: this.recvTransport!.id,
      } satisfies VoiceRoomCommon.IConsume);

    const consumer = await this.recvTransport!.consume(result);

    const stream = new MediaStream([consumer.track]);

    const peerGainLevels = this._peerGainLevels();
    const gain = peerGainLevels[peer.id] ?? 1;

    // Chrome workaround
    // https://issues.chromium.org/issues/40094084
    const _audioEl = new Audio();
    _audioEl.srcObject = stream;
    _audioEl.autoplay = false;
    _audioEl.muted = true;

    consumer.on('trackended', () => {
      _audioEl.srcObject = null;
      _audioEl.remove();
    });

    const context = await this.speakerService.getContext();

    const sourceNode = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();
    gainNode.gain.value = this.soundMuted() ? 0 : gain;
    const analyserNode = context.createAnalyser();
    analyserNode.fftSize = 128;

    sourceNode.connect(gainNode);
    sourceNode.connect(analyserNode);
    gainNode.connect(context.destination);

    this._peers.update((peers) => ({
      ...peers,
      [peer.id]: {
        ...peer,
        sourceNode,
        gainNode,
        analyserNode,
        _audioEl,
        consumers: [
          ...peer.consumers,
          {
            producerId: data.producerId,
            consumer,
          },
        ],
      },
    }));

    consumer.resume();
  }

  protected async ensureSendTransport() {
    if (this.sendTransport) {
      return;
    }
    const result: VoiceRoomCommon.ICreateTransportResult =
      await this.socket.emitWithAck(VoiceRoomCommon.EEvent.CREATE_TRANSPORT, {
        direction: 'send',
        sctpCapabilities: this.device.sctpCapabilities,
      } satisfies VoiceRoomCommon.ICreateTransport);

    this.sendTransport = this.device.createSendTransport(result);

    this.sendTransport.on(
      'connect',
      async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.socket.emitWithAck(
            VoiceRoomCommon.EEvent.CONNECT_TRANSPORT,
            {
              transportId: this.sendTransport!.id,
              dtlsParameters,
            } satisfies VoiceRoomCommon.IConnectTransport,
          );
          callback();
        } catch (err) {
          errback(err as Error);
        }
      },
    );

    this.sendTransport.on(
      'produce',
      async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          const res: VoiceRoomCommon.IProduceResult =
            await this.socket.emitWithAck(VoiceRoomCommon.EEvent.PRODUCE, {
              kind,
              rtpParameters,
              transportId: this.sendTransport!.id,
              mediaTag: appData['mediaTag'] as VoiceRoomCommon.MediaTag,
            } satisfies VoiceRoomCommon.IProduce);
          callback({ id: res.producerId });
        } catch (error) {
          errback(error as Error);
        }
      },
    );
  }

  protected async ensureRecvTransport() {
    if (this.recvTransport) {
      return;
    }
    const result: VoiceRoomCommon.ICreateTransportResult =
      await this.socket.emitWithAck(VoiceRoomCommon.EEvent.CREATE_TRANSPORT, {
        direction: 'recv',
        sctpCapabilities: this.device.sctpCapabilities,
      } satisfies VoiceRoomCommon.ICreateTransport);

    this.recvTransport = this.device.createRecvTransport(result);

    this.recvTransport.on(
      'connect',
      async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.socket.emitWithAck(
            VoiceRoomCommon.EEvent.CONNECT_TRANSPORT,
            {
              transportId: this.recvTransport!.id,
              dtlsParameters,
            } satisfies VoiceRoomCommon.IConnectTransport,
          );
          callback();
        } catch (err) {
          errback(err as Error);
        }
      },
    );
  }

  public async setAudioInput(device: MediaDeviceInfo | null) {
    if (this.microphoneProducer) {
      this.microphoneProducer.close();
    }
    await this.microphoneService.setDevice(device);
    const stream = await this.microphoneService.getStream();
    this.microphoneProducer = await this.sendTransport!.produce({
      track: stream.getTracks()[0],
      appData: { mediaTag: 'mic' },
    });
  }

  public async setAudioOutput(device: MediaDeviceInfo | null) {
    await this.speakerService.setDevice(device);
  }

  public async setMicrophoneMuted(value: boolean) {
    this._microphoneMuted.set(value);
    const track = this.microphoneProducer?.track;
    if (track) {
      track.enabled = !value;
    }
  }

  public setSoundMuted(value: boolean): void {
    this._soundMuted.set(value);
    for (const p of Object.values(this.peers())) {
      if (p.gainNode) {
        const gain = value ? 0 : (this.peerGainLevels()[p.id] ?? 1);
        p.gainNode.gain.value = gain;
      }
    }
  }

  public setPeerGain(userId: number, gain: number): void {
    this._peerGainLevels.update((levels) => ({
      ...levels,
      [userId]: gain,
    }));
    const peer = this.peers()[userId];
    if (peer && peer.gainNode && !this.soundMuted) {
      peer.gainNode.gain.value = gain;
    }
  }

  // Проверяем, есть ли звук в потоке (создаем анализатор)
  // const analyser = context.createAnalyser();
  // analyser.fftSize = 128;
  // sourceNode.connect(analyser); // Подключаем также к анализатору

  // const dataArray = new Uint8Array(analyser.frequencyBinCount);

  // // Функция для проверки уровня звука
  // const checkAudioLevel = () => {
  //   analyser.getByteFrequencyData(dataArray);
  //   const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
  //   console.log('Audio level:', average);
  //   if (average > 0) {
  //     console.log('✅ Audio detected! Level:', average);
  //   }
  //   // Проверяем каждые 500мс пока есть звук
  //   if (peer.sourceNode) {
  //     setTimeout(checkAudioLevel, 500);
  //   }
  // };
  // // Начинаем проверку через небольшую задержку
  // setTimeout(checkAudioLevel, 1000);
}
