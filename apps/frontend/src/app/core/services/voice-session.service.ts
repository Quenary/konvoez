import { inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import {
  EVoiceRoomEvent,
  EVoiceSessionType,
  IVoiceRoomJoin,
  IVoiceRoomProduceResult,
  TVoiceSessionTarget,
} from '@konvoez/shared';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { Mutex } from 'async-mutex';
import { interval, Subject } from 'rxjs';
import { IAudioDeviceHandler } from '../tokens/audio-device-handler.token';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { AudioService } from './audio.service';
import {
  IConsumePeerContext,
  MediasoupSessionService,
} from './mediasoup-session.service';
import { MicrophoneService } from './microphone.service';
import { PeerPlaybackService } from './peer-playback.service';
import { ScreenWakeLockService } from './screen-wake-lock.service';
import { SpeakerService } from './speaker.service';

const voiceSessionMutex = new Mutex();
const micControlsMutex = new Mutex();

/**
 * Owns the active voice session: join/leave, socket listeners, reconnect, and device switching.
 * Does not hold peer UI state (see VoiceRoomStore) or call signaling (see DirectCallService).
 */
@Injectable({
  providedIn: 'root',
})
export class VoiceSessionService implements IAudioDeviceHandler {
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly microphoneService = inject(MicrophoneService);
  private readonly speakerService = inject(SpeakerService);
  private readonly audioService = inject(AudioService);
  private readonly mediasoupSessionService = inject(MediasoupSessionService);
  private readonly peerPlaybackService = inject(PeerPlaybackService);
  private readonly screenWakeLockService = inject(ScreenWakeLockService);

  private readonly sessionWillChangeSubject = new Subject<{
    previous: TVoiceSessionTarget | null;
    next: TVoiceSessionTarget;
  }>();
  public readonly sessionWillChange$ =
    this.sessionWillChangeSubject.asObservable();

  constructor() {
    this.socket.on('connect', () => {
      this.mediasoupSessionService.cleanup();
      const session = this.voiceRoomStore.activeSession();
      if (session) {
        void this.joinSession(session);
      }
      void this.updateRoomsState();
    });
    if (this.socket.connected) {
      void this.updateRoomsState();
    }

    interval(10000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.socket.connected) {
          void this.updateRoomsState();
        }
      });
  }

  @Mutexed(voiceSessionMutex)
  public async joinSession(target: TVoiceSessionTarget): Promise<void> {
    await this.joinSessionLocked(target);
  }

  @Mutexed(voiceSessionMutex)
  public async leaveSession(): Promise<void> {
    await this.leaveSessionLocked();
  }

  @Mutexed(micControlsMutex)
  public async setAudioInput(device: MediaDeviceInfo | null): Promise<void> {
    await this.microphoneService.setDevice(device);
    await this.mediasoupSessionService.produceMicrophone(
      this.voiceRoomStore.microphoneMuted(),
    );
  }

  @Mutexed()
  public async setAudioOutput(device: MediaDeviceInfo | null): Promise<void> {
    await this.speakerService.setDevice(device);
  }

  private async joinSessionLocked(target: TVoiceSessionTarget): Promise<void> {
    this.audioService.playPeerJoinAudio();
    const previous = this.voiceRoomStore.activeSession();
    this.sessionWillChangeSubject.next({ previous, next: target });

    if (this.voiceRoomStore.activeSession()) {
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

      this.voiceRoomStore.setActiveSession(target);
      await this.updateRoomsState();
      await this.mediasoupSessionService.ensureDeviceLoaded();
      await this.mediasoupSessionService.ensureSendTransport(
        this.voiceRoomStore.microphoneMuted(),
      );
      await this.mediasoupSessionService.ensureRecvTransport();
      void this.screenWakeLockService.acquire();
    } catch (error) {
      if (this.voiceRoomStore.activeSession()) {
        await this.leaveSessionLocked();
      } else {
        this.removeSocketListeners();
      }
      throw error;
    }
  }

  private async leaveSessionLocked(): Promise<void> {
    if (!this.voiceRoomStore.activeSession()) {
      return;
    }

    this.screenWakeLockService.release();
    this.voiceRoomStore.setActiveSession(null);
    this.removeSocketListeners();
    this.mediasoupSessionService.clearPendingConsumes();
    await this.socket.emitWithAck(EVoiceRoomEvent.LEAVE_ROOM);
    this.voiceRoomStore.clearSessionPeers();
    this.mediasoupSessionService.cleanup();
    await this.microphoneService.release();
    await this.updateRoomsState();
    this.audioService.playPeerLeaveAudio();
  }

  private addSocketListeners(): void {
    this.removeSocketListeners();

    this.socket.on(EVoiceRoomEvent.PEERS_ON_JOIN, async (data) => {
      const users = Object.values(data);
      this.voiceRoomStore.setPeers(users);

      await Promise.all(
        users.flatMap((user) =>
          user.producers.map((producer) => this.consume(producer)),
        ),
      );
      await this.consumePending();
    });

    this.socket.on(EVoiceRoomEvent.PEER_JOINED, async (data) => {
      this.voiceRoomStore.upsertPeer(data.user);
      if (data.roomId !== undefined) {
        this.voiceRoomStore.addPeerToRoom(data.roomId, data.user);
      }
      await this.consumePending();
    });

    this.socket.on(EVoiceRoomEvent.PEER_LEFT, (data) => {
      this.voiceRoomStore.removePeer(data.user.id);
      if (data.roomId !== undefined) {
        this.voiceRoomStore.removePeerFromRoom(data.roomId, data.user.id);
      }
    });

    this.socket.on(EVoiceRoomEvent.PRODUCER_CREATED, async (data) => {
      await this.consume(data);
    });

    this.socket.on(EVoiceRoomEvent.PRODUCER_CLOSED, (data) => {
      this.peerPlaybackService.removeConsumer(data.userId, data.producerId);
    });
  }

  private removeSocketListeners(): void {
    this.socket.off(EVoiceRoomEvent.PEERS_ON_JOIN);
    this.socket.off(EVoiceRoomEvent.PEER_JOINED);
    this.socket.off(EVoiceRoomEvent.PEER_LEFT);
    this.socket.off(EVoiceRoomEvent.PRODUCER_CLOSED);
    this.socket.off(EVoiceRoomEvent.PRODUCER_CREATED);
  }

  private async updateRoomsState(): Promise<void> {
    try {
      const roomsState = await this.socket.emitWithAck(
        EVoiceRoomEvent.GET_ALL_PEERS,
      );
      this.voiceRoomStore.setRoomsState(roomsState);
    } catch (error) {
      console.error('Failed to update all rooms state', error);
    }
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
    const peersDict = this.voiceRoomStore.peersDict();
    const peerGainLevels = this.voiceRoomStore.peerGainLevels();
    const speakerMuted = this.voiceRoomStore.speakerMuted();
    if (!peersDict[userId]) {
      return null;
    }
    return {
      gain: peerGainLevels[userId] ?? 1,
      speakerMuted,
    };
  }
}
