import {
  IUser,
  IVoiceRoomGetAllPeersSnapshot,
  IVoiceRoomLobbyPeerJoined,
  IVoiceRoomLobbyPeerLeft,
  TVoiceRoomGetAllPeersResult,
} from '@konvoez/shared';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { mapRoomsUser, omitRoomsUser, toPeerUser } from './voice-peer.helpers';

type LobbyEvent =
  | { kind: 'joined'; payload: IVoiceRoomLobbyPeerJoined }
  | { kind: 'left'; payload: IVoiceRoomLobbyPeerLeft };

/**
 * - `applied`: the event was applied to `roomsState`.
 * - `stale`: already covered by the snapshot; ignored.
 * - `buffered`: no snapshot yet; kept until `setRoomsSnapshot`.
 * - `gap`: events were missed (or the server restarted); a new snapshot is required.
 */
export type TVoiceLobbyIncrementalResult =
  'applied' | 'stale' | 'buffered' | 'gap';

type VoiceLobbyState = {
  roomsState: TVoiceRoomGetAllPeersResult;
  /** Server process id of the last applied snapshot; `null` until synced. */
  lobbyEpoch: string | null;
  lobbyRevision: number | null;
  pendingLobbyEvents: LobbyEvent[];
};

const initialState: VoiceLobbyState = {
  roomsState: {},
  lobbyEpoch: null,
  lobbyRevision: null,
  pendingLobbyEvents: [],
};

/**
 * Voice lobby presence: who is in which group voice room.
 * Independent of the active session peers list.
 */
export const VoiceLobbyStore = signalStore(
  { providedIn: 'root' },
  withState<VoiceLobbyState>(initialState),
  withMethods((store) => {
    const applyJoined = (payload: IVoiceRoomLobbyPeerJoined): void => {
      const peer = toPeerUser(payload.user);
      patchState(store, (state) => ({
        roomsState: {
          ...state.roomsState,
          [payload.roomId]: {
            ...state.roomsState[payload.roomId],
            [peer.id]: peer,
          },
        },
      }));
    };

    const applyLeft = (payload: IVoiceRoomLobbyPeerLeft): void => {
      patchState(store, (state) => {
        const room = state.roomsState[payload.roomId] || {};
        if (!room[payload.userId]) {
          return {};
        }
        const { [payload.userId]: _removed, ...rest } = room;
        return {
          roomsState: {
            ...state.roomsState,
            [payload.roomId]: rest,
          },
        };
      });
    };

    const applyIncremental = (
      event: LobbyEvent,
    ): TVoiceLobbyIncrementalResult => {
      const epoch = store.lobbyEpoch();
      const revision = store.lobbyRevision();
      if (epoch === null || revision === null) {
        patchState(store, (state) => ({
          pendingLobbyEvents: [...state.pendingLobbyEvents, event],
        }));
        return 'buffered';
      }

      if (event.payload.epoch !== epoch) {
        return 'gap';
      }
      if (event.payload.revision <= revision) {
        return 'stale';
      }
      if (event.payload.revision > revision + 1) {
        return 'gap';
      }

      if (event.kind === 'joined') {
        applyJoined(event.payload);
      } else {
        applyLeft(event.payload);
      }
      patchState(store, { lobbyRevision: event.payload.revision });
      return 'applied';
    };

    /** Applies events buffered before the snapshot; returns whether a new snapshot is needed. */
    const flushPendingEvents = (): boolean => {
      const sorted = [...store.pendingLobbyEvents()].sort(
        (a, b) => a.payload.revision - b.payload.revision,
      );
      patchState(store, { pendingLobbyEvents: [] });

      return sorted.some((event) => applyIncremental(event) === 'gap');
    };

    return {
      /**
       * Replaces the lobby with a server snapshot and replays buffered events on top of it.
       * Returns `true` when buffered events show the snapshot is already outdated.
       */
      setRoomsSnapshot(snapshot: IVoiceRoomGetAllPeersSnapshot): boolean {
        const isOlderSnapshotOfSameEpoch =
          store.lobbyEpoch() === snapshot.epoch &&
          (store.lobbyRevision() ?? -1) > snapshot.revision;
        if (isOlderSnapshotOfSameEpoch) {
          return false;
        }

        patchState(store, {
          roomsState: snapshot.rooms,
          lobbyEpoch: snapshot.epoch,
          lobbyRevision: snapshot.revision,
        });
        return flushPendingEvents();
      },

      applyVoicePeerJoined(
        payload: IVoiceRoomLobbyPeerJoined,
      ): TVoiceLobbyIncrementalResult {
        return applyIncremental({ kind: 'joined', payload });
      },

      applyVoicePeerLeft(
        payload: IVoiceRoomLobbyPeerLeft,
      ): TVoiceLobbyIncrementalResult {
        return applyIncremental({ kind: 'left', payload });
      },

      /** Buffers incoming events until the next snapshot (e.g. after a socket disconnect). */
      markUnsynced(): void {
        patchState(store, { lobbyEpoch: null, lobbyRevision: null });
      },

      reset(): void {
        patchState(store, initialState);
      },

      applyUserEntityUpdate(user: IUser): void {
        patchState(store, (state) => ({
          roomsState: mapRoomsUser(state.roomsState, user),
        }));
      },

      applyUserEntityDeleted(userId: number): void {
        patchState(store, (state) => ({
          roomsState: omitRoomsUser(state.roomsState, userId),
        }));
      },
    };
  }),
);
