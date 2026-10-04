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
  TVoiceSessionTarget,
  EVoiceSessionType,
} from '@konvoez/shared';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { IAudioDeviceHandler } from '../tokens/audio-device-handler.token';
import { MicrophoneService } from './microphone.service';
import { SpeakerService } from './speaker.service';
import { AudioActivityService } from './audio-activity.service';
import { DirectCallService } from './direct-call.service';
import { EStorageKey } from '../../app.enums';
import type { Device } from 'mediasoup-client';
import { Consumer, Producer, Transport } from 'mediasoup-client/types';
import type {
  ConsumerOptions,
  RtpCapabilities,
  TransportOptions,
} from 'mediasoup-client/types';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { createEntityAdapter } from '@ngrx/entity';
import { patchState, signalState } from '@ngrx/signals';
import { interval } from 'rxjs';
import { Mutex } from 'async-mutex';
import { SettingsStore } from '@features/settings/settings.store';
import { AudioService } from './audio.service';

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
/** Serializes join/leave so concurrent session switches cannot interleave. */
const voiceSessionMutex = new Mutex();
/** Serializes mediasoup device/transport setup (methods call each other). */
const mediasoupMutex = new Mutex();
/** Serializes mic device/mute changes that touch the local producer. */
const micControlsMutex = new Mutex();

/**
 * Active voice session service:
 * preserves state, listens to socket events, manages input/output streams.
 */
@Injectable({
  providedIn: 'root',
})
export class VoiceRoomService implements IAudioDeviceHandler {
  private readonly injector = inject(Injector);
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly microphoneService = inject(MicrophoneService);
  private readonly speakerService = inject(SpeakerService);
  private readonly audioActivityService = inject(AudioActivityService);
  private readonly audioService = inject(AudioService);

  private readonly _activeSession = signal<TVoiceSessionTarget | null>(null);
  private readonly _roomsState = signal<Readonly<TVoiceRoomGetAllPeersResult>>(
    {},
  );
  private readonly _microphoneMuted = signal<boolean>(
    !!localStorage.getItemJson(EStorageKey.MICROPHONE_MUTED),
  );
  private readonly _speakerMuted = signal<boolean>(
    !!localStorage.getItemJson(EStorageKey.SPEAKER_MUTED),
  );
  private readonly _peerGainLevels = signal<Readonly<Record<number, number>>>(
    localStorage.getItemJson(EStorageKey.PEER_GAIN_LEVELS) ?? {},
  );
  private readonly peersState = signalState(peersInitialState);

  /**
   * Active voice session target (GROUP_ROOM or DIRECT_CALL)
   */
  public readonly activeSession = this._activeSession.asReadonly();
  /**
   * Selected voice room id (group rooms only)
   */
  public readonly selectedRoomId = computed(() => {
    const session = this._activeSession();
    return session?.type === EVoiceSessionType.GROUP_ROOM
      ? session.roomId
      : null;
  });
  /**
   * Direct call target if currently in a direct-call media session
   */
  public readonly directCallTarget = computed(() => {
    const session = this._activeSession();
    return session?.type === EVoiceSessionType.DIRECT_CALL ? session : null;
  });
  /**
   * All voice rooms state
   */
  public readonly roomsState = this._roomsState.asReadonly();
  /**
   * Microphone muted
   */
  public readonly microphoneMuted = this._microphoneMuted.asReadonly();
  /**
   * Sound output muted
   */
  public readonly speakerMuted = this._speakerMuted.asReadonly();
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
  public readonly peerGainLevels = this._peerGainLevels.asReadonly();

  protected pendingConsumes: IVoiceRoomProduceResult[] = [];

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

  private screenWakeLock: WakeLockSentinel | null = null;
  private screenWakeLockOnRelease: (() => void) | null = null;
  private readonly onDocumentVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this._activeSession()) {
      void this.acquireScreenWakeLock();
    }
  };

  constructor() {
    effect(() => {
      const value = this.microphoneMuted();
      localStorage.setItemJson(EStorageKey.MICROPHONE_MUTED, value);
    });

    effect(() => {
      const value = this.speakerMuted();
      localStorage.setItemJson(EStorageKey.SPEAKER_MUTED, value);
    });

    // Reconnect to room / session and refresh the lobby peer list.
    this.socket.on('connect', () => {
      this.cleanupMediasoup();
      const session = this.activeSession();
      if (session) {
        this.joinSession(session);
      }
      void this.updateRoomsState();
    });
    if (this.socket.connected) {
      void this.updateRoomsState();
    }

    interval(10000).subscribe(async () => {
      if (this.socket.connected) {
        await this.updateRoomsState();
      }
    });

    document.addEventListener(
      'visibilitychange',
      this.onDocumentVisibilityChange,
    );
  }

  @Mutexed(voiceSessionMutex)
  public async joinSession(target: TVoiceSessionTarget): Promise<void> {
    await this.joinSessionLocked(target);
  }

  /**
   * User-facing leave: cancels/leaves a direct call when one is active,
   * otherwise leaves the current group voice session.
   */
  public async leaveCurrent(): Promise<void> {
    const directCallService = this.injector.get(DirectCallService);
    if (directCallService.isCallActive()) {
      await directCallService.leaveCall();
      return;
    }
    await this.leaveSession();
  }

  /**
   * Leave the current mediasoup session (group room or direct-call media).
   * Prefer {@link leaveCurrent} from UI hangup/leave buttons.
   */
  @Mutexed(voiceSessionMutex)
  public async leaveSession(): Promise<void> {
    await this.leaveSessionLocked();
  }

  private async joinSessionLocked(target: TVoiceSessionTarget): Promise<void> {
    this.audioService.playPeerJoinAudio();
    const directCallService = this.injector.get(DirectCallService);
    const previous = this._activeSession();
    const leavingDirectCall =
      previous?.type === EVoiceSessionType.DIRECT_CALL &&
      (target.type !== EVoiceSessionType.DIRECT_CALL ||
        target.callId !== previous.callId);
    const joiningGroupWhileInCall =
      target.type === EVoiceSessionType.GROUP_ROOM &&
      directCallService.isConnected();

    // Switching away from a live call must not hang up the remote party.
    if (leavingDirectCall || joiningGroupWhileInCall) {
      directCallService.detachFromCallWithoutHangup();
    }

    if (this._activeSession()) {
      await this.leaveSessionLocked();
    }

    this.addSocketListeners();

    await this.socket.emitWithAck(EVoiceRoomEvent.JOIN_ROOM, {
      sessionTarget: target,
      roomId:
        target.type === EVoiceSessionType.GROUP_ROOM
          ? target.roomId
          : undefined,
    } satisfies IVoiceRoomJoin);

    this._activeSession.set(target);
    await this.updateRoomsState();
    await this.ensureDeviceLoaded();
    await this.ensureSendTransport();
    await this.ensureRecvTransport();
    void this.acquireScreenWakeLock();
  }

  private async leaveSessionLocked(): Promise<void> {
    if (!this._activeSession()) {
      return;
    }

    this.releaseScreenWakeLock();
    this._activeSession.set(null);
    this.removeSocketListeners();
    this.pendingConsumes = [];
    this.consuming.clear();
    await this.socket.emitWithAck(EVoiceRoomEvent.LEAVE_ROOM);
    this.cleanupAllPeers();
    this.cleanupMediasoup();
    await this.microphoneService.release();
    await this.updateRoomsState();
    this.audioService.playPeerLeaveAudio();
  }

  @Mutexed(micControlsMutex)
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

  @Mutexed(micControlsMutex)
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
    this._peerGainLevels.update((levels) => {
      const next = {
        ...levels,
        [userId]: gain,
      };
      localStorage.setItemJson(EStorageKey.PEER_GAIN_LEVELS, next);
      return next;
    });
    const peer = this.peersDict()[userId];
    if (peer?.gainNode && !this.speakerMuted()) {
      peer.gainNode.gain.value = gain;
    }
  }

  public applyUserEntityUpdate(user: IUser): void {
    const existing = this.peersDict()[user.id];
    if (existing) {
      patchState(
        this.peersState,
        peersStateAdapter.mapOne(
          {
            id: user.id,
            map: (peer) => ({
              ...peer,
              ...user,
            }),
          },
          this.peersState(),
        ),
      );
    }

    this._roomsState.update((rooms) => {
      let changed = false;
      const next: Record<number, Record<number, IUser>> = {};
      for (const [roomId, peers] of Object.entries(rooms)) {
        const roomPeers = peers as Record<number, IUser>;
        if (roomPeers[user.id]) {
          changed = true;
          next[Number(roomId)] = {
            ...roomPeers,
            [user.id]: user,
          };
        } else {
          next[Number(roomId)] = roomPeers;
        }
      }
      return changed ? next : rooms;
    });
  }

  public applyUserEntityDeleted(userId: number): void {
    const peer = this.peersDict()[userId];
    if (peer) {
      this.cleanupPeer(peer);
      patchState(
        this.peersState,
        peersStateAdapter.removeOne(userId, this.peersState()),
      );
    }

    this._roomsState.update((rooms) => {
      let changed = false;
      const next: Record<number, Record<number, IUser>> = {};
      for (const [roomId, peers] of Object.entries(rooms)) {
        const roomPeers = peers as Record<number, IUser>;
        if (roomPeers[userId]) {
          changed = true;
          const { [userId]: _, ...rest } = roomPeers;
          next[Number(roomId)] = rest;
        } else {
          next[Number(roomId)] = roomPeers;
        }
      }
      return changed ? next : rooms;
    });
  }

  /**
   * Update all rooms state from backend
   */
  private get settingsStore(): InstanceType<typeof SettingsStore> {
    return this.injector.get(SettingsStore);
  }

  private async updateRoomsState() {
    try {
      const roomsState: TVoiceRoomGetAllPeersResult =
        await this.socket.emitWithAck(EVoiceRoomEvent.GET_ALL_PEERS);
      this._roomsState.set(roomsState);
    } catch (error) {
      console.error('Failed to update all rooms state', error);
    }
  }

  private async acquireScreenWakeLock(): Promise<void> {
    const wakeLock = navigator.wakeLock;
    if (!wakeLock?.request) {
      return;
    }
    if (this.screenWakeLock) {
      return;
    }
    try {
      const sentinel = await wakeLock.request('screen');
      this.screenWakeLock = sentinel;
      const onRelease = (): void => {
        sentinel.removeEventListener('release', onRelease);
        if (this.screenWakeLockOnRelease === onRelease) {
          this.screenWakeLockOnRelease = null;
        }
        if (this.screenWakeLock === sentinel) {
          this.screenWakeLock = null;
        }
      };
      this.screenWakeLockOnRelease = onRelease;
      sentinel.addEventListener('release', onRelease);
    } catch (error) {
      console.error('Screen wake lock unavailable', error);
    }
  }

  private releaseScreenWakeLock(): void {
    const sentinel = this.screenWakeLock;
    const onRelease = this.screenWakeLockOnRelease;
    this.screenWakeLock = null;
    this.screenWakeLockOnRelease = null;
    if (!sentinel) {
      return;
    }
    if (onRelease) {
      sentinel.removeEventListener('release', onRelease);
    }
    void sentinel.release().catch(() => {
      // Sentinel may already be released by the browser.
    });
  }

  private addSocketListeners(): void {
    this.removeSocketListeners();

    // Existing peers present when we join the session
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

    // A new peer joined the session
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

      if (data.roomId !== undefined) {
        const roomId = data.roomId;
        this._roomsState.update((rooms) => ({
          ...rooms,
          [roomId]: {
            ...rooms[roomId],
            [data.user.id]: data.user,
          },
        }));
      }

      await this.consumePending();
    });

    // A peer left the session
    this.socket.on(EVoiceRoomEvent.PEER_LEFT, (data) => {
      const peer = this.peersDict()[data.user.id];
      if (peer) {
        this.cleanupPeer(peer);
      }

      patchState(
        this.peersState,
        peersStateAdapter.removeOne(data.user.id, this.peersState()),
      );

      if (data.roomId !== undefined) {
        const roomId = data.roomId;
        const statePeer = this.roomsState()[roomId]?.[data.user.id];
        if (statePeer) {
          this._roomsState.update((rooms) => {
            const room = rooms[roomId] || {};
            const { [data.user.id]: _, ...rest } = room;
            return {
              ...rooms,
              [roomId]: rest,
            };
          });
        }
      }
    });

    // A remote producer was created — start consuming it
    this.socket.on(EVoiceRoomEvent.PRODUCER_CREATED, async (data) => {
      await this.consume(data);
    });

    // A remote producer was closed — drop the matching consumer
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
      this.audioActivityService.unregister(peer.id);
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

  @Mutexed(mediasoupMutex)
  private async ensureDeviceLoaded() {
    await this.ensureDeviceLoadedLocked();
  }

  private async ensureDeviceLoadedLocked() {
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
      await this.device.load({
        routerRtpCapabilities:
          routerRtpCapabilities as unknown as RtpCapabilities,
      });
      console.debug('Can produce video', this.device.canProduce('video'));
      console.debug('Can produce audio', this.device.canProduce('audio'));
    } catch (error) {
      console.error('Error loading device', error);
    }
  }

  @Mutexed(mediasoupMutex)
  private async ensureSendTransport() {
    if (this.sendTransport) {
      return;
    }

    await this.ensureDeviceLoadedLocked();

    const result: IVoiceRoomCreateTransportResult =
      await this.socket.emitWithAck(EVoiceRoomEvent.CREATE_TRANSPORT, {
        direction: 'send',
      } satisfies IVoiceRoomCreateTransport);

    const iceServers = this.settingsStore.iceServers();

    this.sendTransport = this.device!.createSendTransport({
      ...(result as unknown as TransportOptions),
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
          console.debug('connect success', res);
          callback();
        } catch (err) {
          errback(err as Error);
        }
      },
    );

    this.sendTransport.on(
      'produce',
      async ({ kind, rtpParameters, appData }, callback, errback) => {
        console.debug('pruduce', kind, rtpParameters, appData);
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
      console.debug('Send transport state change', state);
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

  @Mutexed(mediasoupMutex)
  private async ensureRecvTransport() {
    if (this.recvTransport) {
      return;
    }

    await this.ensureDeviceLoadedLocked();

    const result: IVoiceRoomCreateTransportResult =
      await this.socket.emitWithAck(EVoiceRoomEvent.CREATE_TRANSPORT, {
        direction: 'recv',
      } satisfies IVoiceRoomCreateTransport);

    const iceServers = this.settingsStore.iceServers();

    this.recvTransport = this.device!.createRecvTransport({
      ...(result as unknown as TransportOptions),
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
      console.debug('Recv transport state change', state);
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

    console.debug('consume', data);

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
        // Transport setup yields; PEER_JOINED may have already drained an empty
        // pending queue before this push. Re-check and drain if the peer is here.
        if (this.peersDict()[data.userId]) {
          await this.consumePending();
        }
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

      const consumer = await this.recvTransport!.consume(
        result as unknown as ConsumerOptions,
      );

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
        console.debug('trackended');
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

      this.audioActivityService.register(peer.id, analyserNode);

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
