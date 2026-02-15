import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { io, Socket } from 'socket.io-client';
import { selectIsAuthorized } from '../auth/auth.selectors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, tap, withLatestFrom } from 'rxjs';
import { VoiceRoomCommon } from '@common/voice-room';
import { VoiceRoomActions } from './voice-room.actions';
import {
  selectActiveVoiceRoomId,
  selectActiveVoiceRoomPeers,
} from './voice-room.selectors';
import { IPeerWithRTC } from './voice-room.reducer';
import { selectAudioInput } from '../settings/settings.selectors';
import { getStream } from '../../shared/functions/get-stream.function';
import { AudioService } from '../../core/services/audio.service';

@Injectable()
export class VoiceRoomEffects {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly audioService = inject(AudioService);

  private readonly socket = io(`${window.location.origin}`, {
    autoConnect: false,
    path: '/api/voice',
  }) as Socket<VoiceRoomCommon.TEventMap>;

  constructor() {
    this.store
      .select(selectIsAuthorized)
      .pipe(
        takeUntilDestroyed(),
        finalize(() => {
          this.socket.disconnect();
        }),
      )
      .subscribe((auth) => {
        if (auth) {
          this.socket.connect();
        } else {
          this.socket.disconnect();
        }
      });

    this.socket.on(VoiceRoomCommon.EEvent.EXISTING_PEERS_ALL, (data) => {
      this.store.dispatch(VoiceRoomActions.existingPeersAll({ data }));
    });
  }

  readonly mute$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.setMicMuted, VoiceRoomActions.setSoundMuted),
        tap(() => {
          this.audioService.playMuteAudio();
        }),
      ),
    { dispatch: false },
  );

  readonly join$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.join),
        withLatestFrom(this.store.select(selectActiveVoiceRoomId)),
        tap(([action, activeVoiceRoomId]) => {
          this.onLeave();
          this.onJoin(action.id);
          this.audioService.playPeerJoinAudio();
        }),
      ),
    { dispatch: false },
  );

  readonly leave$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.leave),
        tap(() => {
          this.onLeave();
          this.audioService.playPeerLeaveAudio();
        }),
      ),
    { dispatch: false },
  );

  readonly peerJoined = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.peerJoined),
        withLatestFrom(
          this.store.select(selectActiveVoiceRoomPeers),
          this.store.select(selectAudioInput),
        ),
        tap(async ([action, peers, audioInput]) => {
          const peer = await this.createPeer(
            action.data.peer,
            false,
            audioInput,
          );
          peers = [...peers, peer];
          this.store.dispatch(VoiceRoomActions.setActivePeers({ peers }));
          this.audioService.playPeerJoinAudio();
        }),
      ),
    { dispatch: false },
  );

  readonly peerLeft$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.peerLeft),
        withLatestFrom(this.store.select(selectActiveVoiceRoomPeers)),
        tap(([action, peers]) => {
          const peer = peers.find(
            (p) => p.clientId === action.data.peer.clientId,
          );
          if (peer) {
            peer.rtc.close();
            peers = peers.filter((p) => p !== peer);
            this.store.dispatch(VoiceRoomActions.setActivePeers({ peers }));
          }
          this.audioService.playPeerLeaveAudio();
        }),
      ),
    { dispatch: false },
  );

  readonly signal$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.signal),
        withLatestFrom(this.store.select(selectActiveVoiceRoomPeers)),
        tap(async ([action, activePeers]) => {
          const { from, payload } = action.data;
          const peer = from && activePeers.find((p) => p.clientId === from);
          if (!peer) {
            return;
          }

          if (payload.sdi) {
            await peer.rtc.setRemoteDescription(payload.sdi);

            if (payload.sdi.type === 'offer') {
              const answer = await peer.rtc.createAnswer();
              await peer.rtc.setLocalDescription(answer);
              this.socket.emit(VoiceRoomCommon.EEvent.SIGNAL, {
                to: from,
                payload: {
                  sdi: answer,
                },
              });
            }
          }

          if (payload.candidate) {
            await peer.rtc.addIceCandidate(payload.candidate);
          }
        }),
      ),
    { dispatch: false },
  );

  readonly existingPeersOnJoin$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.existingPeersOnJoin),
        withLatestFrom(this.store.select(selectAudioInput)),
        tap(async ([action, audioInput]) => {
          const peers = await Promise.all(
            action.data.peers.map(
              async (p) => await this.createPeer(p, true, audioInput),
            ),
          );
          this.store.dispatch(VoiceRoomActions.setActivePeers({ peers }));
        }),
      ),
    { dispatch: false },
  );

  private onJoin(roomId: number): void {
    this.socket.emit(VoiceRoomCommon.EEvent.JOIN_ROOM, {
      roomId,
    } satisfies VoiceRoomCommon.IJoinRoom);

    this.socket.on(
      VoiceRoomCommon.EEvent.PEER_JOINED,
      (data: VoiceRoomCommon.IPeerJoined) => {
        this.store.dispatch(VoiceRoomActions.peerJoined({ data }));
      },
    );

    this.socket.on(
      VoiceRoomCommon.EEvent.PEER_LEFT,
      (data: VoiceRoomCommon.IPeerLeft) => {
        this.store.dispatch(VoiceRoomActions.peerLeft({ data }));
      },
    );

    this.socket.on(VoiceRoomCommon.EEvent.SIGNAL, (data) => {
      this.store.dispatch(VoiceRoomActions.signal({ data }));
    });

    this.socket.on(VoiceRoomCommon.EEvent.EXISTING_PEERS_ON_JOIN, (data) => {
      this.store.dispatch(VoiceRoomActions.existingPeersOnJoin({ data }));
    });
  }

  private onLeave(): void {
    this.socket.emit(VoiceRoomCommon.EEvent.LEAVE_ROOM, {});
    this.socket.removeListener(VoiceRoomCommon.EEvent.PEER_JOINED);
    this.socket.removeListener(VoiceRoomCommon.EEvent.PEER_LEFT);
    this.socket.removeListener(VoiceRoomCommon.EEvent.SIGNAL);
    this.socket.removeListener(VoiceRoomCommon.EEvent.EXISTING_PEERS_ON_JOIN);
  }

  private async createPeer(
    peer: VoiceRoomCommon.IPeer,
    initiator: boolean,
    device: MediaDeviceInfo | null,
  ): Promise<IPeerWithRTC> {
    const rtc = new RTCPeerConnection();
    // const rtc = new RTCPeerConnection({
    //   iceServers: [
    //     { urls: 'stun:stun.l.google.com:19302' },
    //     { urls: 'stun:stun.chathelp.ru:3478' },
    //     { urls: 'stun:stun2.l.google.com:19302' },
    //   ],
    // });

    const stream = await getStream(device);
    stream.getTracks().forEach((t) => {
      rtc.addTrack(t, stream);
    });

    rtc.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket.emit(VoiceRoomCommon.EEvent.SIGNAL, {
          to: peer.clientId,
          payload: {
            candidate: e.candidate,
          },
        });
      }
    };

    if (initiator) {
      rtc.createOffer().then((offer) => {
        rtc.setLocalDescription(offer).then(() => {
          this.socket.emit(VoiceRoomCommon.EEvent.SIGNAL, {
            to: peer.clientId,
            payload: {
              sdi: offer,
            },
          });
        });
      });
    }

    return {
      ...peer,
      rtc: rtc,
    };
  }
}
