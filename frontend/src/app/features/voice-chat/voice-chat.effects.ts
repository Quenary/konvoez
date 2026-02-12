import { inject, Injectable, provideCheckNoChangesConfig } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { io, Socket } from 'socket.io-client';
import { selectIsAuthorized } from '../auth/auth.selectors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, fromEvent, Subscription, tap, withLatestFrom } from 'rxjs';
import { VoiceChatNS } from '@common/voice-chat';
import { VoiceChatActions } from './voice-chat.actions';
import { selectActiveVoiceChatPeers } from './voice-chat.selectors';
import { IPeerWithRTC } from './voice-chat.reducer';

@Injectable()
export class VoiceChatEffects {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);

  private readonly socket = io(`${window.location.origin}`, {
    autoConnect: false,
    path: '/api/voice',
  }) as Socket<VoiceChatNS.TEventMap>;

  localStream!: MediaStream;

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

    this.socket.on(VoiceChatNS.EEvent.EXISTING_PEERS_ALL, (data) => {
      this.store.dispatch(VoiceChatActions.existingPeersAll({ data }));
    });

    setTimeout(() => {
      navigator.mediaDevices
        .getUserMedia({
          audio: true,
        })
        .then((s) => {
          this.localStream = s;
        });
    }, 1000);
  }

  readonly join$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceChatActions.join),
        tap((action) => {
          this.onLeave();
          this.onJoin(action.id);
        }),
      ),
    { dispatch: false },
  );

  readonly leave$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceChatActions.leave),
        tap(() => {
          this.onLeave();
        }),
      ),
    { dispatch: false },
  );

  readonly peerJoined = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceChatActions.peerJoined),
        withLatestFrom(this.store.select(selectActiveVoiceChatPeers)),
        tap(([action, peers]) => {
          const peer = this.createPeer(action.data.peer, false);
          peers = [...peers, peer];
          this.store.dispatch(VoiceChatActions.setActivePeers({ peers }));
        }),
      ),
    { dispatch: false },
  );

  readonly peerLeft$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceChatActions.peerLeft),
        withLatestFrom(this.store.select(selectActiveVoiceChatPeers)),
        tap(([action, peers]) => {
          const peer = peers.find((p) => p.clientId === action.data.peer.clientId);
          if (peer) {
            peer.rtc.close();
            peers = peers.filter((p) => p !== peer);
            this.store.dispatch(VoiceChatActions.setActivePeers({ peers }));
          }
        }),
      ),
    { dispatch: false },
  );

  readonly signal$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceChatActions.signal),
        withLatestFrom(this.store.select(selectActiveVoiceChatPeers)),
        tap(async ([action, activeVoiceChatPeers]) => {
          const { from, payload } = action.data;
          const peer = from && activeVoiceChatPeers.find((p) => p.clientId === from);
          if (!peer) {
            return;
          }

          if (payload.sdi) {
            await peer.rtc.setRemoteDescription(payload.sdi);

            if (payload.sdi.type === 'offer') {
              const answer = await peer.rtc.createAnswer();
              await peer.rtc.setLocalDescription(answer);
              this.socket.emit(VoiceChatNS.EEvent.SIGNAL, {
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
        ofType(VoiceChatActions.existingPeersOnJoin),
        tap((action) => {
          const peers = action.data.peers.map((p) => this.createPeer(p, true));
          this.store.dispatch(VoiceChatActions.setActivePeers({ peers }));
        }),
      ),
    { dispatch: false },
  );

  private onJoin(roomId: number): void {
    this.socket.emit(VoiceChatNS.EEvent.JOIN_ROOM, { roomId } satisfies VoiceChatNS.IJoinRoom);

    this.socket.on(VoiceChatNS.EEvent.PEER_JOINED, (data: VoiceChatNS.IPeerJoined) => {
      this.store.dispatch(VoiceChatActions.peerJoined({ data }));
    });

    this.socket.on(VoiceChatNS.EEvent.PEER_LEFT, (data: VoiceChatNS.IPeerLeft) => {
      this.store.dispatch(VoiceChatActions.peerLeft({ data }));
    });

    this.socket.on(VoiceChatNS.EEvent.SIGNAL, (data) => {
      this.store.dispatch(VoiceChatActions.signal({ data }));
    });

    this.socket.on(VoiceChatNS.EEvent.EXISTING_PEERS_ON_JOIN, (data) => {
      this.store.dispatch(VoiceChatActions.existingPeersOnJoin({ data }));
    });
  }

  private onLeave(): void {
    this.socket.emit(VoiceChatNS.EEvent.LEAVE_ROOM, {});
    this.socket.removeListener(VoiceChatNS.EEvent.PEER_JOINED);
    this.socket.removeListener(VoiceChatNS.EEvent.PEER_LEFT);
    this.socket.removeListener(VoiceChatNS.EEvent.SIGNAL);
    this.socket.removeListener(VoiceChatNS.EEvent.EXISTING_PEERS_ON_JOIN);
  }

  private createPeer(peer: VoiceChatNS.IPeer, initiator: boolean): IPeerWithRTC {
    const rtc = new RTCPeerConnection();
    // const rtc = new RTCPeerConnection({
    //   iceServers: [
    //     { urls: 'stun:stun.l.google.com:19302' },
    //     { urls: 'stun:stun.chathelp.ru:3478' },
    //     { urls: 'stun:stun2.l.google.com:19302' },
    //   ],
    // });

    // TODO choose track
    this.localStream.getTracks().forEach((t) => {
      rtc.addTrack(t, this.localStream);
    });

    rtc.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket.emit(VoiceChatNS.EEvent.SIGNAL, {
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
          this.socket.emit(VoiceChatNS.EEvent.SIGNAL, {
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
