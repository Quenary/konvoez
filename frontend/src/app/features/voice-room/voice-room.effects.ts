import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { selectIsAuthorized } from '../auth/auth.selectors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, tap, withLatestFrom } from 'rxjs';
import { VoiceRoomCommon } from '@common/voice-room';
import { VoiceRoomActions } from './voice-room.actions';
import { selectActiveVoiceRoomPeers } from './voice-room.selectors';
import { AudioService } from '../../core/services/audio.service';
import { VoiceRoomService } from '../../core/services/voice-room.service';
import { SocketInjectionToken } from '../../core/services/socket-io.token';

@Injectable()
export class VoiceRoomEffects {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly audioService = inject(AudioService);
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly socket = inject(SocketInjectionToken);

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

  readonly setMicMuted$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.setMicMuted),
        tap((action) => {
          this.voiceRoomService.setMicMuted(action.micMuted);
          this.audioService.playMuteAudio();
        }),
      ),
    { dispatch: false },
  );

  readonly setSoundMuted$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.setSoundMuted),
        tap((action) => {
          this.voiceRoomService.setSoundMuted(action.soundMuted);
          this.audioService.playMuteAudio();
        }),
      ),
    { dispatch: false },
  );

  readonly join$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.join),
        tap(async (action) => {
          this.socket.emit(VoiceRoomCommon.EEvent.JOIN_ROOM, {
            roomId: action.id,
          });
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
          this.socket.on(
            VoiceRoomCommon.EEvent.EXISTING_PEERS_ON_JOIN,
            (data) => {
              this.store.dispatch(
                VoiceRoomActions.existingPeersOnJoin({ data }),
              );
            },
          );
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
          this.socket.emit(VoiceRoomCommon.EEvent.LEAVE_ROOM, {});
          this.socket.removeListener(VoiceRoomCommon.EEvent.PEER_JOINED);
          this.socket.removeListener(VoiceRoomCommon.EEvent.PEER_LEFT);
          this.socket.removeListener(
            VoiceRoomCommon.EEvent.EXISTING_PEERS_ON_JOIN,
          );
          this.voiceRoomService.removeAllPeers();
          this.store.dispatch(VoiceRoomActions.setActivePeers({ peers: [] }));
          this.audioService.playPeerLeaveAudio();
        }),
      ),
    { dispatch: false },
  );

  readonly peerJoined = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.peerJoined),
        withLatestFrom(this.store.select(selectActiveVoiceRoomPeers)),
        tap(async ([action, peers]) => {
          await this.voiceRoomService.addPeer(action.data.peer, false);
          peers = [...peers, action.data.peer];
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
            this.voiceRoomService.removePeer(peer);
            peers = peers.filter((p) => p !== peer);
            this.store.dispatch(VoiceRoomActions.setActivePeers({ peers }));
          }
          this.audioService.playPeerLeaveAudio();
        }),
      ),
    { dispatch: false },
  );

  readonly existingPeersOnJoin$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.existingPeersOnJoin),
        tap(async (action) => {
          await Promise.all(
            action.data.peers.map((p) =>
              this.voiceRoomService.addPeer(p, true),
            ),
          );
          this.store.dispatch(
            VoiceRoomActions.setActivePeers({ peers: action.data.peers }),
          );
        }),
      ),
    { dispatch: false },
  );
}
