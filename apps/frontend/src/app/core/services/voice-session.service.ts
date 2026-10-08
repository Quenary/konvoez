import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import {
  EVoiceRoomEvent,
  EVoiceSessionType,
  IVoiceRoomJoin,
  IVoiceRoomProduceResult,
  TVoiceSessionTarget,
  getVoiceSessionKey,
} from '@konvoez/shared';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { notifyError } from '@shared/functions/notify-error.function';
import { Mutex } from 'async-mutex';
import { Subject } from 'rxjs';
import { IAudioDeviceHandler } from '../tokens/audio-device-handler.token';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { AudioService } from './audio.service';
import {
  IConsumePeerContext,
  MediasoupSessionService,
} from './mediasoup-session.service';
import { MicrophoneService } from './microphone.service';
import { PeerPlaybackService } from './peer-playback.service';
import { PeerVideoService } from './peer-video.service';
import { ScreenWatchService } from './screen-watch.service';
import { ScreenWakeLockService } from './screen-wake-lock.service';
import { SpeakerService } from './speaker.service';

const voiceSessionMutex = new Mutex();
const micControlsMutex = new Mutex();

/**
 * Owns the active voice session: join/leave, socket listeners, reconnect, and device switching.
 * Peer UI state lives in VoiceSessionStore / VoiceAudioPreferencesStore.
 * Lobby presence is synced via EntitySyncService.
 * Call signaling is in DirectCallService.
 */
@Injectable({
  providedIn: 'root',
})
export class VoiceSessionService implements IAudioDeviceHandler {
  private readonly store = inject(Store);
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly audioActivityService = inject(AudioActivityService);
  private readonly voiceAudioPreferencesStore = inject(
    VoiceAudioPreferencesStore,
  );
  private readonly microphoneService = inject(MicrophoneService);
  private readonly speakerService = inject(SpeakerService);
  private readonly audioService = inject(AudioService);
  private readonly mediasoupSessionService = inject(MediasoupSessionService);
  private readonly peerPlaybackService = inject(PeerPlaybackService);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly screenWatchService = inject(ScreenWatchService);
  private readonly screenWakeLockService = inject(ScreenWakeLockService);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  private readonly sessionWillChangeSubject = new Subject<{
    previous: TVoiceSessionTarget | null;
    next: TVoiceSessionTarget;
  }>();
  public readonly sessionWillChange$ =
    this.sessionWillChangeSubject.asObservable();

  /** Target of an in-flight `joinSession` (before JOIN_ROOM ack). */
  private readonly joiningTargetState = signal<TVoiceSessionTarget | null>(
    null,
  );
  public readonly joiningTarget = this.joiningTargetState.asReadonly();

  /** Send transport is ready and join is not in flight. */
  public readonly canProduce = computed(
    () =>
      this.voiceSessionStore.activeSession() !== null &&
      this.joiningTargetState() === null,
  );

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  constructor() {
    this.socket.on('connect', () => {
      this.mediasoupSessionService.cleanup();
      const session = this.voiceSessionStore.activeSession();
      if (session) {
        void this.joinSession(session, { force: true }).catch(
          (error: unknown) => {
            this.reportJoinFailure(error);
          },
        );
      }
    });

    effect(() => {
      const stream = this.microphoneService.processedStream();
      const session = this.voiceSessionStore.activeSession();
      const track = stream?.getAudioTracks()[0] ?? null;
      if (!session || !track) {
        return;
      }
      void this.mediasoupSessionService.replaceMicrophoneTrack(track);
    });

    let registeredUserId: number | null = null;
    effect(() => {
      const session = this.voiceSessionStore.activeSession();
      const user = this.currentUser();
      const microphoneMuted = this.voiceAudioPreferencesStore.microphoneMuted();
      const analyserNode = this.microphoneService.analyserNode();
      const nextUserId =
        session && user && analyserNode && !microphoneMuted ? user.id : null;

      if (registeredUserId !== null && registeredUserId !== nextUserId) {
        this.audioActivityService.unregister(registeredUserId);
      }
      if (nextUserId !== null && analyserNode) {
        this.audioActivityService.register(nextUserId, analyserNode);
      }
      registeredUserId = nextUserId;
    });
  }

  public applyUserEntityDeleted(userId: number): void {
    this.releasePeerMedia(userId);
    this.voiceSessionStore.applyUserEntityDeleted(userId);
  }

  public releasePeerMedia(userId: number): void {
    this.peerPlaybackService.detach(userId);
    this.peerVideoService.removeUser(userId);
    this.screenWatchService.release(userId);
  }

  public reportJoinFailure(error: unknown): void {
    console.error('Failed to join voice session', error);
    notifyError(
      this.tuiNotificationsService,
      this.translateService,
      'VOICE.JOIN_FAILED',
    );
  }

  @Mutexed(voiceSessionMutex)
  public async joinSession(
    target: TVoiceSessionTarget,
    options?: { force?: boolean },
  ): Promise<void> {
    await this.joinSessionLocked(target, options?.force ?? false);
  }

  @Mutexed(voiceSessionMutex)
  public async leaveSession(): Promise<void> {
    await this.leaveSessionLocked();
  }

  @Mutexed(micControlsMutex)
  public async setAudioInput(device: MediaDeviceInfo | null): Promise<void> {
    await this.microphoneService.setDevice(device);
    const track =
      this.microphoneService.processedStream()?.getAudioTracks()[0] ?? null;
    if (!track) {
      return;
    }
    await this.mediasoupSessionService.replaceMicrophoneTrack(track);
  }

  @Mutexed()
  public async setAudioOutput(device: MediaDeviceInfo | null): Promise<void> {
    await this.speakerService.setDevice(device);
  }

  private async joinSessionLocked(
    target: TVoiceSessionTarget,
    force: boolean,
  ): Promise<void> {
    const targetKey = getVoiceSessionKey(target);
    const previous = this.voiceSessionStore.activeSession();
    if (!force && previous && getVoiceSessionKey(previous) === targetKey) {
      return;
    }
    const pending = this.joiningTargetState();
    if (!force && pending && getVoiceSessionKey(pending) === targetKey) {
      return;
    }

    this.joiningTargetState.set(target);
    try {
      await this.joinSessionLockedInner(target, previous);
    } finally {
      const pending = this.joiningTargetState();
      if (pending && getVoiceSessionKey(pending) === targetKey) {
        this.joiningTargetState.set(null);
      }
    }
  }

  private async joinSessionLockedInner(
    target: TVoiceSessionTarget,
    previous: TVoiceSessionTarget | null,
  ): Promise<void> {
    this.audioService.playPeerJoinAudio();
    this.sessionWillChangeSubject.next({ previous, next: target });

    if (this.voiceSessionStore.activeSession()) {
      await this.leaveSessionLocked();
    }

    this.addSocketListeners();

    try {
      await this.socket.emitWithAck(EVoiceRoomEvent.JOIN_ROOM, {
        sessionTarget: target,
        roomId:
          target.type === EVoiceSessionType.GROUP_ROOM
            ? target.roomId
            : undefined,
      } satisfies IVoiceRoomJoin);

      this.voiceSessionStore.setActiveSession(target);
      await this.mediasoupSessionService.ensureDeviceLoaded();
      this.mediasoupSessionService.setMicrophoneMuted(
        this.voiceAudioPreferencesStore.microphoneMuted(),
      );
      await this.mediasoupSessionService.ensureSendTransport();
      await this.mediasoupSessionService.ensureRecvTransport();
      void this.screenWakeLockService.acquire();
    } catch (error) {
      if (this.voiceSessionStore.activeSession()) {
        await this.leaveSessionLocked();
      } else {
        this.removeSocketListeners();
      }
      throw error;
    }
  }

  private async leaveSessionLocked(): Promise<void> {
    if (!this.voiceSessionStore.activeSession()) {
      return;
    }

    this.screenWakeLockService.release();
    this.voiceSessionStore.setActiveSession(null);
    this.removeSocketListeners();
    this.mediasoupSessionService.clearPendingConsumes();

    try {
      // A disconnected socket buffers emitWithAck with no ack timeout, and
      // that promise never settles. Skip it, and bound a live socket so local
      // teardown does not wait on the ack.
      if (this.socket.connected) {
        await this.socket.timeout(3000).emitWithAck(EVoiceRoomEvent.LEAVE_ROOM);
      }
    } catch (error) {
      console.error('Failed to leave voice room', error);
    } finally {
      this.peerPlaybackService.detachAll();
      this.voiceSessionStore.clearSessionPeers();
      this.mediasoupSessionService.cleanup();
      await this.microphoneService.release();
      this.audioService.playPeerLeaveAudio();
    }
  }

  public watchPeerScreen(userId: number): Promise<void> {
    const gain =
      this.voiceAudioPreferencesStore.peerScreenGainLevels()[userId] ?? 1;
    return this.screenWatchService.watchScreen(
      userId,
      (id) => this.resolvePeer(id),
      gain,
    );
  }

  public stopWatchingPeerScreen(userId: number): Promise<void> {
    return this.screenWatchService.stopWatchingScreen(userId);
  }

  public produceCamera(): Promise<void> {
    return this.mediasoupSessionService.produceCamera();
  }

  public stopCamera(): Promise<void> {
    return this.mediasoupSessionService.stopCamera();
  }

  public produceScreen(): Promise<void> {
    return this.mediasoupSessionService.produceScreen();
  }

  public stopScreen(): Promise<void> {
    return this.mediasoupSessionService.stopScreen();
  }

  private addSocketListeners(): void {
    this.removeSocketListeners();

    this.socket.on(EVoiceRoomEvent.PEERS_ON_JOIN, async (data) => {
      const users = Object.values(data);
      this.voiceSessionStore.setPeers(users);

      await Promise.all(
        users.flatMap((user) =>
          user.producers.map((producer) => this.consume(producer)),
        ),
      );
      await this.consumePending();
    });

    this.socket.on(EVoiceRoomEvent.PEER_JOINED, async (data) => {
      this.voiceSessionStore.upsertPeer(data.user);
      await this.consumePending();
    });

    this.socket.on(EVoiceRoomEvent.PEER_LEFT, (data) => {
      this.releasePeerMedia(data.user.id);
      this.voiceSessionStore.removePeer(data.user.id);
    });

    this.socket.on(EVoiceRoomEvent.PRODUCER_CREATED, async (data) => {
      await this.consume(data);
    });

    this.socket.on(EVoiceRoomEvent.PRODUCER_CLOSED, (data) => {
      this.peerPlaybackService.removeConsumer(data.userId, data.producerId);
      this.peerVideoService.remove(data.userId, data.producerId);
      this.screenWatchService.onRemoteProducerClosed(
        data.userId,
        data.producerId,
      );
      this.peerVideoService.unregisterAvailableScreenProducer(
        data.userId,
        data.producerId,
      );
    });

    this.socket.on(EVoiceRoomEvent.CONSUMER_CLOSED, (data) => {
      this.mediasoupSessionService.handleConsumerClosed(data.consumerId);
    });
  }

  private removeSocketListeners(): void {
    this.socket.off(EVoiceRoomEvent.PEERS_ON_JOIN);
    this.socket.off(EVoiceRoomEvent.PEER_JOINED);
    this.socket.off(EVoiceRoomEvent.PEER_LEFT);
    this.socket.off(EVoiceRoomEvent.PRODUCER_CLOSED);
    this.socket.off(EVoiceRoomEvent.PRODUCER_CREATED);
    this.socket.off(EVoiceRoomEvent.CONSUMER_CLOSED);
  }

  private async consumePending(): Promise<void> {
    await this.mediasoupSessionService.consumePending((userId) =>
      this.resolvePeer(userId),
    );
  }

  private async consume(data: IVoiceRoomProduceResult): Promise<void> {
    await this.mediasoupSessionService.consume(data, (userId) =>
      this.resolvePeer(userId),
    );
  }

  private resolvePeer(userId: number): IConsumePeerContext | null {
    const peersDict = this.voiceSessionStore.peersDict();
    const peerGainLevels = this.voiceAudioPreferencesStore.peerGainLevels();
    const speakerMuted = this.voiceAudioPreferencesStore.speakerMuted();
    if (!peersDict[userId]) {
      return null;
    }
    return {
      gain: peerGainLevels[userId] ?? 1,
      speakerMuted,
    };
  }
}
