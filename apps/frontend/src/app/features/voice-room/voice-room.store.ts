import { computed, effect, inject } from '@angular/core';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { MediasoupSessionService } from '@core/services/mediasoup-session.service';
import { MicrophoneService } from '@core/services/microphone.service';
import { PeerPlaybackService } from '@core/services/peer-playback.service';
import { PeerScreenAudioService } from '@core/services/peer-screen-audio.service';
import {
  storageGetItemJson,
  storageSetItemJson,
} from '../../../extentions/local-storage-json';
import { EStorageKey } from '../../app.enums';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import {
  EVoiceSessionType,
  IUser,
  TVoiceRoomGetAllPeersResult,
  TVoiceSessionTarget,
} from '@konvoez/shared';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import {
  removeAllEntities,
  removeEntity,
  setAllEntities,
  setEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { Store } from '@ngrx/store';

type VoiceRoomState = {
  activeSession: TVoiceSessionTarget | null;
  roomsState: TVoiceRoomGetAllPeersResult;
  microphoneMuted: boolean;
  speakerMuted: boolean;
  peerGainLevels: Readonly<Record<number, number>>;
  peerScreenGainLevels: Readonly<Record<number, number>>;
};

function createInitialState(): VoiceRoomState {
  return {
    activeSession: null,
    roomsState: {},
    microphoneMuted: !!storageGetItemJson<boolean>(
      EStorageKey.MICROPHONE_MUTED,
    ),
    speakerMuted: !!storageGetItemJson<boolean>(EStorageKey.SPEAKER_MUTED),
    peerGainLevels:
      storageGetItemJson<Record<number, number>>(
        EStorageKey.PEER_GAIN_LEVELS,
      ) ?? {},
    peerScreenGainLevels:
      storageGetItemJson<Record<number, number>>(
        EStorageKey.PEER_SCREEN_GAIN_LEVELS,
      ) ?? {},
  };
}

function toPeerUser(user: IUser & { producers?: unknown }): IUser {
  const { producers: _producers, ...rest } = user;
  return rest;
}

function mapRoomsUser(
  rooms: TVoiceRoomGetAllPeersResult,
  user: IUser,
): TVoiceRoomGetAllPeersResult {
  let changed = false;
  const next: Record<number, Record<number, IUser>> = {};
  for (const [roomId, peers] of Object.entries(rooms)) {
    const roomPeers = peers;
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
}

function omitRoomsUser(
  rooms: TVoiceRoomGetAllPeersResult,
  userId: number,
): TVoiceRoomGetAllPeersResult {
  let changed = false;
  const next: Record<number, Record<number, IUser>> = {};
  for (const [roomId, peers] of Object.entries(rooms)) {
    if (peers[userId]) {
      changed = true;
      const { [userId]: _removed, ...rest } = peers;
      next[Number(roomId)] = rest;
    } else {
      next[Number(roomId)] = peers;
    }
  }
  return changed ? next : rooms;
}

/**
 * Voice domain state: active session, session peers (`IUser`), lobby rooms, mute, and per-peer gain.
 * Does not own mediasoup objects or Web Audio nodes.
 */
export const VoiceRoomStore = signalStore(
  { providedIn: 'root' },
  withState(createInitialState),
  withEntities<IUser>(),
  withComputed(({ activeSession, entities, entityMap }) => ({
    selectedRoomId: computed(() => {
      const session = activeSession();
      return session?.type === EVoiceSessionType.GROUP_ROOM
        ? session.roomId
        : null;
    }),
    directCallTarget: computed(() => {
      const session = activeSession();
      return session?.type === EVoiceSessionType.DIRECT_CALL ? session : null;
    }),
    peersList: entities,
    peersDict: entityMap,
  })),
  withMethods(
    (
      store,
      peerPlaybackService = inject(PeerPlaybackService),
      peerScreenAudioService = inject(PeerScreenAudioService),
      mediasoupSessionService = inject(MediasoupSessionService),
    ) => ({
      setActiveSession(activeSession: TVoiceSessionTarget | null): void {
        patchState(store, { activeSession });
      },

      setRoomsState(roomsState: TVoiceRoomGetAllPeersResult): void {
        patchState(store, { roomsState });
      },

      setPeers(users: IUser[]): void {
        patchState(store, setAllEntities(users.map(toPeerUser)));
      },

      upsertPeer(user: IUser): void {
        patchState(store, setEntity(toPeerUser(user)));
      },

      addPeerToRoom(roomId: number, user: IUser): void {
        const peer = toPeerUser(user);
        patchState(store, (state) => ({
          roomsState: {
            ...state.roomsState,
            [roomId]: {
              ...state.roomsState[roomId],
              [peer.id]: peer,
            },
          },
        }));
      },

      removePeer(userId: number): void {
        peerPlaybackService.detach(userId);
        patchState(store, removeEntity(userId));
      },

      removePeerFromRoom(roomId: number, userId: number): void {
        patchState(store, (state) => {
          const room = state.roomsState[roomId] || {};
          if (!room[userId]) {
            return {};
          }
          const { [userId]: _removed, ...rest } = room;
          return {
            roomsState: {
              ...state.roomsState,
              [roomId]: rest,
            },
          };
        });
      },

      clearSessionPeers(): void {
        peerPlaybackService.detachAll();
        patchState(store, removeAllEntities());
      },

      setMicrophoneMuted(microphoneMuted: boolean): void {
        patchState(store, { microphoneMuted });
        mediasoupSessionService.setMicrophoneMuted(microphoneMuted);
      },

      setSpeakerMuted(speakerMuted: boolean): void {
        patchState(store, { speakerMuted });
        peerPlaybackService.applySpeakerMuted(
          speakerMuted,
          store.peerGainLevels(),
        );
        peerScreenAudioService.applySpeakerMuted(
          speakerMuted,
          store.peerScreenGainLevels(),
        );
      },

      setPeerGain(userId: number, gain: number): void {
        patchState(store, (state) => {
          const peerGainLevels = {
            ...state.peerGainLevels,
            [userId]: gain,
          };
          storageSetItemJson(EStorageKey.PEER_GAIN_LEVELS, peerGainLevels);
          return { peerGainLevels };
        });
        peerPlaybackService.setPeerGain(userId, gain, store.speakerMuted());
      },

      setPeerScreenGain(userId: number, gain: number): void {
        patchState(store, (state) => {
          const peerScreenGainLevels = {
            ...state.peerScreenGainLevels,
            [userId]: gain,
          };
          storageSetItemJson(
            EStorageKey.PEER_SCREEN_GAIN_LEVELS,
            peerScreenGainLevels,
          );
          return { peerScreenGainLevels };
        });
        peerScreenAudioService.setGain(userId, gain, store.speakerMuted());
      },

      applyUserEntityUpdate(user: IUser): void {
        const existing = store.entityMap()[user.id];
        if (existing) {
          patchState(store, setEntity({ ...existing, ...user }));
        }
        patchState(store, (state) => ({
          roomsState: mapRoomsUser(state.roomsState, user),
        }));
      },

      applyUserEntityDeleted(userId: number): void {
        if (store.entityMap()[userId]) {
          peerPlaybackService.detach(userId);
          patchState(store, removeEntity(userId));
        }
        patchState(store, (state) => ({
          roomsState: omitRoomsUser(state.roomsState, userId),
        }));
      },
    }),
  ),
  withHooks({
    onInit(store) {
      const microphoneService = inject(MicrophoneService);
      const audioActivityService = inject(AudioActivityService);
      const ngrxStore = inject(Store);
      const currentUser = ngrxStore.selectSignal(selectCurrentUser);

      effect(() => {
        const value = store.microphoneMuted();
        storageSetItemJson(EStorageKey.MICROPHONE_MUTED, value);
      });

      effect(() => {
        const value = store.speakerMuted();
        storageSetItemJson(EStorageKey.SPEAKER_MUTED, value);
      });

      let registeredUserId: number | null = null;
      effect(() => {
        const session = store.activeSession();
        const user = currentUser();
        const microphoneMuted = store.microphoneMuted();
        const analyserNode = microphoneService.analyserNode();
        const nextUserId =
          session && user && analyserNode && !microphoneMuted ? user.id : null;

        if (registeredUserId !== null && registeredUserId !== nextUserId) {
          audioActivityService.unregister(registeredUserId);
        }
        if (nextUserId !== null && analyserNode) {
          audioActivityService.register(nextUserId, analyserNode);
        }
        registeredUserId = nextUserId;
      });
    },
  }),
);
