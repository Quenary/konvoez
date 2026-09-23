import {
  computed,
  effect,
  inject,
  Injectable,
  Injector,
  signal,
} from '@angular/core';
import {
  IVoiceRoomConnectTransport,
  IVoiceRoomConsume,
  IVoiceRoomConsumeResult,
  IVoiceRoomCreateTransport,
  IVoiceRoomCreateTransportResult,
  TVoiceRoomGetAllPeersResult,
  IVoiceRoomJoin,
  IVoiceRoomProduce,
  IVoiceRoomProduceResult,
  IUser,
  EVoiceRoomEvent,
  TVoiceRoomMediaTag,
} from '@konvoez/shared';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { IAudioDeviceHandler } from '../tokens/audio-device-handler.token';
import { MicrophoneService } from './microphone.service';
import { SpeakerService } from './speaker.service';
import { EStorageKey } from '../../app.enums';
import type { Device } from 'mediasoup-client';
import { Consumer, Producer, Transport } from 'mediasoup-client/types';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { createEntityAdapter } from '@ngrx/entity';
import { patchState, signalState } from '@ngrx/signals';
import { interval } from 'rxjs';
import { SettingsStore } from '@features/settings/settings.store';

interface IManagedPeer extends IUser {
  consumers: Consumer[];
  sourceNode: MediaStreamAudioSourceNode | null;
  gainNode: GainNode | null;
  analyserNode: AnalyserNode | null;
  _audioEl: HTMLAudioElement | null;
}

const peersStateAdapter = createEntityAdapter<IManagedPeer>({
  selectId: (item) => item.id,
});
const peersStateSelectors = peersStateAdapter.getSelectors();
const peersInitialState = peersStateAdapter.getInitialState();

/**
 * Active voice room service
 * - preserves state
 * - listen events
 * - manages input/output streams
 */
@Injectable({
  providedIn: 'root',
})
export class VoiceRoomService implements IAudioDeviceHandler {
  private readonly injector = inject(Injector);
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly microphoneService = inject(MicrophoneService);
  private readonly speakerService = inject(SpeakerService);

  private get settingsStore(): InstanceType<typeof SettingsStore> {
    return this.injector.get(SettingsStore);
  }

  //#region Mediasoup
  private device: Device | null = null;

  private sendTransport: Transport | null = null;

  private recvTransport: Transport | null = null;

  private microphoneProducer: Producer | null = null;

  /**
   * Set of producer ids being consumed at the moment.
   */
  private readonly consuming = new Set<string>();
  //#endregion

  /**
   * Selected voice room id
   */
  private readonly _selectedRoomId = signal<number | null>(null);
  /**
   * Selected voice room id
   */
  public readonly selectedRoomId = this._selectedRoomId.asReadonly();
  /**
   * All voice rooms state
   */
  private readonly _roomsState = signal<Readonly<TVoiceRoomGetAllPeersResult>>(
    {},
  );
  /**
   * All voice rooms state
   */
  public readonly roomsState = this._roomsState.asReadonly();
  /**
   * Microphone muted
   */
  private readonly _microphoneMuted = signal<boolean>(
    !!localStorage.getItemJson(EStorageKey.MICROPHONE_MUTED),
  );
  /**
   * Microphone muted
   */
  public readonly microphoneMuted = this._microphoneMuted.asReadonly();
  /**
   * Sound output muted
   */
  private readonly _speakerMuted = signal<boolean>(
    !!localStorage.getItemJson(EStorageKey.SPEAKER_MUTED),
  );
  /**
   * Sound output muted
   */
  public readonly speakerMuted = this._speakerMuted.asReadonly();
  /***
   * Active peers state
   */
  private readonly peersState = signalState(peersInitialState);
  /**
   * Active peers state (dict, userId: info)
   */
  public readonly peersDict = computed(() => {
    const peersState = this.peersState();
    return peersStateSelectors.selectEntities(peersState);
  });
  /**
   * Active peers state (list)
   */
  public readonly peersList = computed(() => {
    const peersState = this.peersState();
    return peersStateSelectors.selectAll(peersState);
  });
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

  protected pendingConsumes: IVoiceRoomProduceResult[] = [];

  constructor() {
    effect(() => {
      const value = this.microphoneMuted();
      localStorage.setItemJson(EStorageKey.MICROPHONE_MUTED, value);
    });

    effect(() => {
      const value = this.speakerMuted();
      localStorage.setItemJson(EStorageKey.SPEAKER_MUTED, value);
    });

    // Reconnect to room
    this.socket.on('connect', () => {
      this.cleanupMediasoup();
      const roomId = this.selectedRoomId();
      if (roomId) {
        this.joinRoom(roomId);
      }
    });

    interval(10000).subscribe(async () => {
      if (this.socket.connected) {
        await this.updateRoomsState();
      }
    });
  }

  public async joinRoom(roomId: number) {
    if (this.selectedRoomId()) {
      await this.leaveRoom();
    }

    this._selectedRoomId.set(roomId);

    this.addSocketListeners();

    await this.socket.emitWithAck(EVoiceRoomEvent.JOIN_ROOM, {
      roomId,
    } satisfies IVoiceRoomJoin);

    await this.updateRoomsState();

    await this.ensureDeviceLoaded();
    await this.ensureSendTransport();
    await this.ensureRecvTransport();
  }

  public async leaveRoom() {
    this._selectedRoomId.set(null);
    this.removeSocketListeners();
    await this.socket.emitWithAck(EVoiceRoomEvent.LEAVE_ROOM);
    this.cleanupAllPeers();
    this.cleanupMediasoup();
    await this.microphoneService.release();
    await this.updateRoomsState();
  }

  @Mutexed()
  public async setAudioInput(device: MediaDeviceInfo | null) {
    await this.microphoneService.setDevice(device);

    if (this.sendTransport) {
      await this.produceMicrophone();
    }
  }

  @Mutexed()
  public async setAudioOutput(device: MediaDeviceInfo | null) {
    await this.speakerService.setDevice(device);
  }

  @Mutexed()
  public async setMicrophoneMuted(value: boolean) {
    this._microphoneMuted.set(value);
    const track = this.microphoneProducer?.track;
    if (track) {
      track.enabled = !value;
    }
  }

  public setSpeakerMuted(value: boolean): void {
    this._speakerMuted.set(value);
    for (const p of this.peersList()) {
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
    const peer = this.peersDict()[userId];
    if (peer && peer.gainNode && !this.speakerMuted) {
      peer.gainNode.gain.value = gain;
    }
  }

  /**
   * Update all rooms state from backend
   */
  private async updateRoomsState() {
    try {
      const roomsState: TVoiceRoomGetAllPeersResult =
        await this.socket.emitWithAck(EVoiceRoomEvent.GET_ALL_PEERS);
      this._roomsState.set(roomsState);
    } catch (error) {
      console.error('Failed to update all rooms state', error);
    }
  }

  private addSocketListeners(): void {
    this.removeSocketListeners();

    // РЎСѓС‰РµСЃС‚РІСѓСЋС‰РёРµ РїРёСЂС‹ РїСЂРё РїРѕРґРєР»СЋС‡РµРЅРёРё
    this.socket.on(EVoiceRoomEvent.PEERS_ON_JOIN, async (data) => {
      patchState(
        this.peersState,
        peersStateAdapter.setAll(
          Object.values(data).map((u) => ({
            ...u,
            sourceNode: null,
            gainNode: null,
            analyserNode: null,
            _audioEl: null,
            consumers: [],
          })),
          this.peersState(),
        ),
      );

      const consumes = Object.values(data)
        .flatMap((u) => u.producers)
        .map((p) => this.consume(p));
      await Promise.all(consumes);

      await this.consumePending();
    });

    // РџРѕРґРєР»СЋС‡РµРЅРёРµ РЅРѕРІРѕРіРѕ РїРёСЂР°
    this.socket.on(EVoiceRoomEvent.PEER_JOINED, async (data) => {
      patchState(
        this.peersState,
        peersStateAdapter.upsertOne(
          {
            ...data.user,
            sourceNode: null,
            gainNode: null,
            analyserNode: null,
            _audioEl: null,
            consumers: [],
          },
          this.peersState(),
        ),
      );

      this._roomsState.update((rooms) => ({
        ...rooms,
        [data.roomId]: {
          ...rooms[data.roomId],
          [data.user.id]: data.user,
        },
      }));

      await this.consumePending();
    });

    // РћС‚РєР»СЋС‡РµРЅРёРµ РїРёСЂР°
    this.socket.on(EVoiceRoomEvent.PEER_LEFT, (data) => {
      const peer = this.peersDict()[data.user.id];
      if (peer) {
        this.cleanupPeer(peer);
      }

      patchState(
        this.peersState,
        peersStateAdapter.removeOne(data.user.id, this.peersState()),
      );

      const statePeer = this.roomsState()[data.roomId]?.[data.user.id];
      if (statePeer) {
        this._roomsState.update((rooms) => {
          const room = rooms[data.roomId] || {};
          const { [data.user.id]: _, ...rest } = room;
          return {
            ...rooms,
            [data.roomId]: rest,
          };
        });
      }
    });

    // РЎРѕР±С‹С‚РёРµ РїСЂРё СЃРѕР·РґР°РЅРёРё РЅРѕРІРѕРіРѕ РїСЂРѕРґСЋСЃРµСЂР°
    this.socket.on(EVoiceRoomEvent.PRODUCER_CREATED, async (data) => {
      await this.consume(data);
    });

    // РЈРґР°Р»РµРЅРёРµ РїСЂРѕРґСЋСЃРµСЂР°
    this.socket.on(EVoiceRoomEvent.PRODUCER_CLOSED, (data) => {
      const peer = this.peersDict()[data.userId];
      if (!peer) return;

      const consumer = peer.consumers.find(
        (c) => c.producerId === data.producerId,
      );
      if (!consumer) return;

      consumer.close();

      patchState(
        this.peersState,
        peersStateAdapter.mapOne(
          {
            id: peer.id,
            map: (item) => ({
              ...item,
              consumers: item.consumers.filter(
                (c) => c.producerId !== data.producerId,
              ),
            }),
          },
          this.peersState(),
        ),
      );
    });
  }

  private removeSocketListeners(): void {
    this.socket.off(EVoiceRoomEvent.PEERS_ON_JOIN);
    this.socket.off(EVoiceRoomEvent.PEER_JOINED);
    this.socket.off(EVoiceRoomEvent.PEER_LEFT);
    this.socket.off(EVoiceRoomEvent.PRODUCER_CREATED);
    this.socket.off(EVoiceRoomEvent.PRODUCER_CLOSED);
  }

  private cleanupMediasoup(): void {
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.microphoneProducer?.close();

    this.sendTransport = null;
    this.recvTransport = null;
    this.microphoneProducer = null;
  }

  private cleanupAllPeers(): void {
    for (const p of this.peersList()) {
      this.cleanupPeer(p);
    }
    patchState(this.peersState, peersInitialState);
  }

  private cleanupPeer(peer: IManagedPeer): void {
    try {
      peer.sourceNode?.disconnect?.();
      peer.gainNode?.disconnect?.();
      peer.analyserNode?.disconnect?.();
      peer._audioEl?.remove();
      peer.consumers.forEach((c) => {
        c.close();
      });
    } catch (error) {
      console.error('Error cleaning up peer', peer, error);
    }
  }

  @Mutexed()
  private async ensureDeviceLoaded() {
    if (!this.device) {
      // mediasoup-client is a CommonJS module. In production builds (esbuild),
      // dynamic import of a CJS module may wrap it so that named exports
      // are unavailable. We fall back to the module default export in that case.
      const mediasoupClient = await import('mediasoup-client');
      const Device =
        mediasoupClient.Device ??
        (
          mediasoupClient as unknown as {
            default: { Device: typeof import('mediasoup-client').Device };
          }
        ).default?.Device;
      if (typeof Device !== 'function') {
        console.error(
          'mediasoup-client Device is not a constructor',
          mediasoupClient,
        );
        throw new Error('Failed to load mediasoup-client Device');
      }
      this.device = new Device();
    }
    if (this.device.loaded) {
      return;
    }
    try {
      const routerRtpCapabilities = await this.socket.emitWithAck(
        EVoiceRoomEvent.GET_RTP_CAPABILITIES,
      );
      await this.device.load({ routerRtpCapabilities });
      console.log('Can produce video', this.device.canProduce('video'));
      console.log('Can produce audio', this.device.canProduce('audio'));
    } catch (error) {
      console.error('Error loading device', error);
    }
  }

  @Mutexed()
  private async ensureSendTransport() {
    if (this.sendTransport) {
      return;
    }

    await this.ensureDeviceLoaded();

    const result: IVoiceRoomCreateTransportResult =
      await this.socket.emitWithAck(EVoiceRoomEvent.CREATE_TRANSPORT, {
        direction: 'send',
      } satisfies IVoiceRoomCreateTransport);

    const iceServers = this.settingsStore.iceServers();

    this.sendTransport = this.device!.createSendTransport({
      ...result,
      iceServers:
        iceServers.length > 0 ? (iceServers as RTCIceServer[]) : undefined,
    });

    this.sendTransport.on(
      'connect',
      async ({ dtlsParameters }, callback, errback) => {
        try {
          const res = await this.socket.emitWithAck(
            EVoiceRoomEvent.CONNECT_TRANSPORT,
            {
              transportId: this.sendTransport!.id,
              dtlsParameters,
            } satisfies IVoiceRoomConnectTransport,
          );
          console.log('connect success', res);
          callback();
        } catch (err) {
          errback(err as Error);
        }
      },
    );

    this.sendTransport.on(
      'produce',
      async ({ kind, rtpParameters, appData }, callback, errback) => {
        console.log('pruduce', kind, rtpParameters, appData);
        try {
          const res: IVoiceRoomProduceResult = await this.socket.emitWithAck(
            EVoiceRoomEvent.PRODUCE,
            {
              kind,
              rtpParameters,
              transportId: this.sendTransport!.id,
              mediaTag: appData['mediaTag'] as TVoiceRoomMediaTag,
            } satisfies IVoiceRoomProduce,
          );
          callback({ id: res.producerId });
        } catch (error) {
          errback(error as Error);
        }
      },
    );

    this.sendTransport.on('connectionstatechange', (state) => {
      console.log('Send transport state change', state);
      if (state === 'failed') {
        this.sendTransport = null;
      }
    });

    await this.produceMicrophone();
  }

  private async produceMicrophone() {
    try {
      const stream = await this.microphoneService.getStream();
      const track = stream.getAudioTracks()[0];
      track.enabled = !this.microphoneMuted();
      this.microphoneProducer = await this.sendTransport!.produce({
        track,
        appData: { mediaTag: 'mic' },
      });
    } catch (error) {
      console.error('Failed to produce microphone\n', error);
    }
  }

  @Mutexed()
  private async ensureRecvTransport() {
    if (this.recvTransport) {
      return;
    }

    await this.ensureDeviceLoaded();

    const result: IVoiceRoomCreateTransportResult =
      await this.socket.emitWithAck(EVoiceRoomEvent.CREATE_TRANSPORT, {
        direction: 'recv',
      } satisfies IVoiceRoomCreateTransport);

    const iceServers = this.settingsStore.iceServers();

    this.recvTransport = this.device!.createRecvTransport({
      ...result,
      iceServers:
        iceServers.length > 0 ? (iceServers as RTCIceServer[]) : undefined,
    });

    this.recvTransport.on(
      'connect',
      async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.socket.emitWithAck(EVoiceRoomEvent.CONNECT_TRANSPORT, {
            transportId: this.recvTransport!.id,
            dtlsParameters,
          } satisfies IVoiceRoomConnectTransport);
          callback();
        } catch (err) {
          errback(err as Error);
        }
      },
    );

    this.recvTransport.on('connectionstatechange', (state) => {
      console.log('Recv transport state change', state);
      if (state === 'failed') {
        this.recvTransport = null;
      }
    });
  }

  @Mutexed()
  private async consumePending() {
    const pendingConsumes = [...this.pendingConsumes];
    this.pendingConsumes = [];
    const consumes = pendingConsumes.map((p) => this.consume(p));
    await Promise.all(consumes);
  }

  private async consume(data: IVoiceRoomProduceResult) {
    if (this.consuming.has(data.producerId)) {
      console.warn('Producer already consuming\n', data);
      return;
    }
    this.consuming.add(data.producerId);

    console.log('consume', data);

    try {
      await this.ensureRecvTransport();

      const peer = this.peersDict()[data.userId];

      if (!peer) {
        console.warn(
          'Peer not found while consuming\n',
          data,
          '\nAdded to pending consumes',
        );
        this.pendingConsumes.push(data);
        return;
      }

      const result: IVoiceRoomConsumeResult = await this.socket.emitWithAck(
        EVoiceRoomEvent.CONSUME,
        {
          producerId: data.producerId,
          rtpCapabilities: this.device!.recvRtpCapabilities,
          transportId: this.recvTransport!.id,
        } satisfies IVoiceRoomConsume,
      );

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
        console.log('trackended');
      });

      const context = await this.speakerService.getContext();

      const sourceNode = context.createMediaStreamSource(stream);
      const gainNode = context.createGain();
      gainNode.gain.value = this.speakerMuted() ? 0 : gain;
      const analyserNode = context.createAnalyser();
      analyserNode.fftSize = 128;

      sourceNode.connect(gainNode);
      gainNode.connect(analyserNode);
      gainNode.connect(context.destination);

      patchState(
        this.peersState,
        peersStateAdapter.mapOne(
          {
            id: peer.id,
            map: (item) => ({
              ...item,
              sourceNode,
              gainNode,
              analyserNode,
              _audioEl,
              consumers: [...item.consumers, consumer],
            }),
          },
          this.peersState(),
        ),
      );

      consumer.resume();
    } catch (error) {
      console.error('Error while consuming', data, error);
    } finally {
      this.consuming.delete(data.producerId);
    }
  }
}
