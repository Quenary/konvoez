import { computed, effect, inject, Injectable, untracked } from '@angular/core';
import { Store } from '@ngrx/store';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceConnectionStore } from '@core/voice/voice-connection.store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import {
  EVoiceConnectionDeadReason,
  EVoiceConnectionState,
  EVoiceRoomEvent,
  EVoiceSessionType,
  TVoiceRoomJoin,
  TVoiceRoomProduceResult,
  TVoiceRoomSessionCheckResult,
  TVoiceRoomSetMuteState,
  TVoiceSessionTarget,
  getVoiceSessionKey,
  VOICE_ICE_RESTART_DELAY_MS,
  VOICE_REJOIN_DELAY_MS,
  VOICE_REJOIN_MAX_ATTEMPTS,
} from '@konvoez/shared';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { notifyError } from '@shared/functions/notify-error.function';
import { Mutex } from 'async-mutex';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { IAudioDeviceHandler } from '../tokens/audio-device-handler.token';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { AppResumeService } from './app-resume.service';
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
import {
  emitVoiceRoomWithAck,
  VOICE_JOIN_ACK_MS,
} from './voice-room-socket-ack';

const voiceSessionMutex = new Mutex();
/** Session check on resume; a dead socket is recycled by AuthSocketManager. */
export const VOICE_RESUME_CHECK_ACK_MS = 3000;
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
  private readonly appResumeService = inject(AppResumeService);
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
  private readonly voiceConnectionStore = inject(VoiceConnectionStore);

  private iceTimer: ReturnType<typeof setTimeout> | null = null;
  private rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  private rejoinAttempts = 0;

  private readonly sessionWillChangeSubject = new Subject<{
    previous: TVoiceSessionTarget | null;
    next: TVoiceSessionTarget;
  }>();
  public readonly sessionWillChange$ =
    this.sessionWillChangeSubject.asObservable();

  private readonly roomClosedSubject = new Subject<{ roomId: number }>();
  public readonly roomClosed$ = this.roomClosedSubject.asObservable();

  public readonly joiningTarget = this.voiceSessionStore.joiningTarget;

  /** Send transport is ready and join is not in flight. */
  public readonly canProduce = computed(
    () =>
      this.voiceSessionStore.activeSession() !== null &&
      this.voiceSessionStore.joiningTarget() === null,
  );

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  constructor() {
    this.voiceConnectionStore.setSocketConnected(this.socket.connected);

    this.socket.on('disconnect', () => {
      this.voiceConnectionStore.setSocketConnected(false);
    });

    this.socket.on('connect', () => {
      this.voiceConnectionStore.setSocketConnected(true);
      const session = this.voiceSessionStore.activeSession();
      if (session) {
        this.voiceConnectionStore.setRecovering(true);
        this.mediasoupSessionService.cleanup();
        void this.joinSession(session, { force: true }).catch(
          (error: unknown) => {
            this.voiceConnectionStore.reset();
            this.reportJoinFailure(error);
          },
        );
      }
    });

    effect(() => {
      const state = this.voiceConnectionStore.state();
      untracked(() => {
        this.handleConnectionStateChange(state);
      });
    });

    this.appResumeService.resume$.pipe(takeUntilDestroyed()).subscribe(() => {
      void this.resumeSession().catch((error: unknown) => {
        this.reportJoinFailure(error);
      });
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

    let previousSessionKey: string | null = null;
    let previousMuteState: { muted: boolean; deafened: boolean } | null = null;
    effect(() => {
      const session = this.voiceSessionStore.activeSession();
      const currentSessionKey = session ? getVoiceSessionKey(session) : null;
      const muted = this.voiceAudioPreferencesStore.microphoneMuted();
      const deafened = this.voiceAudioPreferencesStore.speakerMuted();

      if (!currentSessionKey) {
        previousSessionKey = null;
        previousMuteState = null;
        return;
      }

      if (previousSessionKey !== currentSessionKey) {
        previousSessionKey = currentSessionKey;
        previousMuteState = { muted, deafened };
        return;
      }

      if (
        previousMuteState &&
        (previousMuteState.muted !== muted ||
          previousMuteState.deafened !== deafened)
      ) {
        previousMuteState = { muted, deafened };
        if (this.socket.connected) {
          this.socket.emit(EVoiceRoomEvent.SET_MUTE_STATE, {
            muted,
            deafened,
          } satisfies TVoiceRoomSetMuteState);
        }
      }
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
    notifyError(
      this.tuiNotificationsService,
      this.translateService,
      'VOICE.JOIN_FAILED',
      error,
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

  /**
   * After sleep: rejoin when the server dropped the peer or a transport died,
   * otherwise refresh ICE. A dead socket is left to the reconnect path, whose
   * `connect` handler rejoins.
   */
  @Mutexed(voiceSessionMutex)
  private async resumeSession(): Promise<void> {
    const session = this.voiceSessionStore.activeSession();
    if (
      !session ||
      this.voiceSessionStore.joiningTarget() ||
      !this.socket.connected
    ) {
      return;
    }

    let active: boolean;
    try {
      ({ active } = await emitVoiceRoomWithAck<TVoiceRoomSessionCheckResult>(
        this.socket,
        EVoiceRoomEvent.SESSION_CHECK,
        undefined,
        VOICE_RESUME_CHECK_ACK_MS,
      ));
    } catch {
      return;
    }

    if (active && this.mediasoupSessionService.transportsHealthy()) {
      try {
        await this.mediasoupSessionService.restartIce();
        return;
      } catch (error) {
        console.error('ICE restart failed, rejoining', error);
      }
    }

    await this.rejoinSessionLocked(session);
  }

  @Mutexed(voiceSessionMutex)
  public async rejoin(): Promise<void> {
    const session = this.voiceSessionStore.activeSession();
    if (!session) {
      return;
    }
    this.voiceConnectionStore.clearDead();
    this.rejoinAttempts = 0;
    try {
      await this.rejoinSessionLocked(session);
    } catch (error) {
      this.reportJoinFailure(error);
    }
  }

  private async rejoinSessionLocked(
    session: TVoiceSessionTarget,
  ): Promise<void> {
    this.voiceConnectionStore.setRecovering(true);
    this.mediasoupSessionService.cleanup();
    try {
      await this.joinSessionLocked(session, true);
    } finally {
      this.voiceConnectionStore.setRecovering(false);
    }
  }

  private handleConnectionStateChange(
    state: EVoiceConnectionState | null,
  ): void {
    if (
      state === EVoiceConnectionState.RECONNECTING ||
      state === EVoiceConnectionState.DISCONNECTED
    ) {
      if (!this.iceTimer && !this.voiceConnectionStore.lossReported()) {
        this.iceTimer = setTimeout(() => {
          this.onIceTimer();
        }, VOICE_ICE_RESTART_DELAY_MS);
      }
      return;
    }

    if (
      state === EVoiceConnectionState.CONNECTED ||
      state === EVoiceConnectionState.DEGRADED
    ) {
      this.clearLadderTimers();
      this.rejoinAttempts = 0;
      this.voiceConnectionStore.setRecovering(false);
      if (this.voiceConnectionStore.lossReported()) {
        this.voiceConnectionStore.setLossReported(false);
        this.audioService.playConnectionRestoredAudio();
        this.tuiNotificationsService
          .open(this.translateService.instant('VOICE.CONNECTION_RESTORED'), {
            appearance: 'positive',
            autoClose: 5000,
            closable: true,
          })
          .subscribe();
      }
      return;
    }

    if (state === null) {
      if (!this.voiceConnectionStore.recovering()) {
        this.clearLadderTimers();
        this.rejoinAttempts = 0;
        this.voiceConnectionStore.setLossReported(false);
      }
      return;
    }

    if (state === EVoiceConnectionState.DEAD) {
      this.clearLadderTimers();
      this.voiceConnectionStore.setRecovering(false);
    }
  }

  private onIceTimer(): void {
    this.iceTimer = null;
    this.voiceConnectionStore.setLossReported(true);
    this.audioService.playConnectionLostAudio();
    this.tuiNotificationsService
      .open(this.translateService.instant('VOICE.CONNECTION_LOST'), {
        appearance: 'negative',
        autoClose: 5000,
        closable: true,
      })
      .subscribe();

    if (this.socket.connected) {
      void this.mediasoupSessionService.restartIce().catch((error) => {
        console.error('ICE restart failed', error);
      });
    }

    this.rejoinTimer = setTimeout(() => {
      void this.onRejoinTimer();
    }, VOICE_REJOIN_DELAY_MS);
  }

  @Mutexed(voiceSessionMutex)
  private async onRejoinTimer(): Promise<void> {
    this.rejoinTimer = null;
    const session = this.voiceSessionStore.activeSession();
    if (!session || this.voiceConnectionStore.dead()) {
      return;
    }

    if (!this.socket.connected) {
      return;
    }

    if (this.rejoinAttempts < VOICE_REJOIN_MAX_ATTEMPTS) {
      this.rejoinAttempts++;
      try {
        await this.rejoinSessionLocked(session);
      } catch (error) {
        this.reportJoinFailure(error);
      } finally {
        const state = this.voiceConnectionStore.state();
        const isHealthy =
          state === EVoiceConnectionState.CONNECTED ||
          state === EVoiceConnectionState.DEGRADED;
        if (!this.voiceConnectionStore.dead() && !isHealthy) {
          this.rejoinTimer = setTimeout(() => {
            void this.onRejoinTimer();
          }, VOICE_REJOIN_DELAY_MS);
        }
      }
    } else {
      this.voiceConnectionStore.setDead(
        EVoiceConnectionDeadReason.RECOVERY_FAILED,
      );
      this.clearLadderTimers();
    }
  }

  private clearLadderTimers(): void {
    if (this.iceTimer) {
      clearTimeout(this.iceTimer);
      this.iceTimer = null;
    }
    if (this.rejoinTimer) {
      clearTimeout(this.rejoinTimer);
      this.rejoinTimer = null;
    }
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

    this.voiceSessionStore.setJoiningTarget(target);
    try {
      await this.joinSessionLockedInner(target, previous);
    } finally {
      const pendingJoin = this.voiceSessionStore.joiningTarget();
      if (pendingJoin && getVoiceSessionKey(pendingJoin) === targetKey) {
        this.voiceSessionStore.setJoiningTarget(null);
      }
    }
  }

  private async joinSessionLockedInner(
    target: TVoiceSessionTarget,
    previous: TVoiceSessionTarget | null,
  ): Promise<void> {
    if (!this.voiceConnectionStore.recovering()) {
      this.audioService.playPeerJoinAudio();
    }
    this.sessionWillChangeSubject.next({ previous, next: target });

    if (this.voiceSessionStore.activeSession()) {
      await this.leaveSessionLocked();
    }

    this.addSocketListeners();

    try {
      await emitVoiceRoomWithAck(
        this.socket,
        EVoiceRoomEvent.JOIN_ROOM,
        {
          sessionTarget: target,
          roomId:
            target.type === EVoiceSessionType.GROUP_ROOM
              ? target.roomId
              : undefined,
          muted: this.voiceAudioPreferencesStore.microphoneMuted(),
          deafened: this.voiceAudioPreferencesStore.speakerMuted(),
        } satisfies TVoiceRoomJoin,
        VOICE_JOIN_ACK_MS,
      );

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
      if (!this.voiceConnectionStore.recovering()) {
        this.clearLadderTimers();
        this.voiceConnectionStore.reset();
        this.audioService.playPeerLeaveAudio();
      }
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
      this.audioService.playPeerJoinAudio();
      this.voiceSessionStore.upsertPeer(data.user);
      this.voiceSessionStore.updatePeerMuteState(
        data.user.id,
        data.muted ?? false,
        data.deafened ?? false,
      );
      await this.consumePending();
    });

    this.socket.on(EVoiceRoomEvent.PEER_LEFT, (data) => {
      const activeSession = this.voiceSessionStore.activeSession();
      if (
        data.user.id === this.currentUser()?.id &&
        activeSession &&
        data.sessionKey === getVoiceSessionKey(activeSession)
      ) {
        this.voiceConnectionStore.setDead(EVoiceConnectionDeadReason.EVICTED);
        this.clearLadderTimers();
        this.mediasoupSessionService.cleanup();
        this.screenWakeLockService.release();
        this.peerPlaybackService.detachAll();
        void this.microphoneService.release();
        return;
      }

      const wasInSession = Boolean(
        this.voiceSessionStore.peersDict()[data.user.id],
      );
      this.releasePeerMedia(data.user.id);
      this.voiceSessionStore.removePeer(data.user.id);
      if (wasInSession) {
        this.audioService.playPeerLeaveAudio();
      }
    });

    this.socket.on(EVoiceRoomEvent.PEER_MUTE_CHANGED, (data) => {
      this.voiceSessionStore.updatePeerMuteState(
        data.userId,
        data.muted,
        data.deafened,
      );
    });

    this.socket.on(EVoiceRoomEvent.ROOM_CLOSED, (data) => {
      const session = this.voiceSessionStore.activeSession();
      if (!session || getVoiceSessionKey(session) !== data.sessionKey) {
        return;
      }
      notifyError(
        this.tuiNotificationsService,
        this.translateService,
        'VOICE.ROOM_CLOSED',
      );
      this.roomClosedSubject.next({ roomId: data.roomId });
      void this.leaveSession();
    });

    this.socket.on(EVoiceRoomEvent.PRODUCER_CREATED, async (data) => {
      if (data.mediaTag === 'cam' || data.mediaTag === 'screen') {
        this.audioService.playStreamStartAudio();
      }
      await this.consume(data);
    });

    this.socket.on(EVoiceRoomEvent.PRODUCER_CLOSED, (data) => {
      if (
        data.userId === this.currentUser()?.id &&
        data.producerId === this.mediasoupSessionService.microphoneProducerId &&
        data.reason !== 'peer-left'
      ) {
        void this.onRejoinTimer();
        return;
      }

      const isStream = this.peerVideoService.isStreamProducer(
        data.userId,
        data.producerId,
      );

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

      if (isStream && data.reason !== 'peer-left') {
        this.audioService.playStreamStopAudio();
      }
    });

    this.socket.on(EVoiceRoomEvent.CONSUMER_CLOSED, (data) => {
      this.mediasoupSessionService.handleConsumerClosed(data.consumerId);
    });
  }

  private removeSocketListeners(): void {
    this.socket.off(EVoiceRoomEvent.PEERS_ON_JOIN);
    this.socket.off(EVoiceRoomEvent.PEER_JOINED);
    this.socket.off(EVoiceRoomEvent.PEER_LEFT);
    this.socket.off(EVoiceRoomEvent.PEER_MUTE_CHANGED);
    this.socket.off(EVoiceRoomEvent.ROOM_CLOSED);
    this.socket.off(EVoiceRoomEvent.PRODUCER_CLOSED);
    this.socket.off(EVoiceRoomEvent.PRODUCER_CREATED);
    this.socket.off(EVoiceRoomEvent.CONSUMER_CLOSED);
  }

  private async consumePending(): Promise<void> {
    await this.mediasoupSessionService.consumePending((userId) =>
      this.resolvePeer(userId),
    );
  }

  private async consume(data: TVoiceRoomProduceResult): Promise<void> {
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
