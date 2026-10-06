import { IUser, TVoiceRoomGetAllPeersResult } from '@konvoez/shared';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { mapRoomsUser, omitRoomsUser, toPeerUser } from './voice-peer.helpers';

type VoiceLobbyState = {
  roomsState: TVoiceRoomGetAllPeersResult;
};

/**
 * Voice lobby presence: who is in which group voice room.
 * Independent of the active session peers list.
 */
export const VoiceLobbyStore = signalStore(
  { providedIn: 'root' },
  withState<VoiceLobbyState>({ roomsState: {} }),
  withMethods((store) => ({
    setRoomsState(roomsState: TVoiceRoomGetAllPeersResult): void {
      patchState(store, { roomsState });
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
  })),
);
