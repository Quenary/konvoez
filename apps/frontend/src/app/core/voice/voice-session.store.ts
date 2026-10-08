import { computed } from '@angular/core';
import { EVoiceSessionType, IUser, TVoiceSessionTarget } from '@konvoez/shared';
import {
  patchState,
  signalStore,
  withComputed,
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
import { toPeerUser } from './voice-peer.helpers';

type VoiceSessionState = {
  activeSession: TVoiceSessionTarget | null;
};

/**
 * Active voice session and its peers. App-lifetime; one session at a time.
 * Does not own lobby presence, mute prefs, mediasoup objects, or playback.
 */
export const VoiceSessionStore = signalStore(
  { providedIn: 'root' },
  withState<VoiceSessionState>({ activeSession: null }),
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
  withMethods((store) => ({
    setActiveSession(activeSession: TVoiceSessionTarget | null): void {
      patchState(store, { activeSession });
    },

    setPeers(users: IUser[]): void {
      patchState(store, setAllEntities(users.map(toPeerUser)));
    },

    upsertPeer(user: IUser): void {
      patchState(store, setEntity(toPeerUser(user)));
    },

    removePeer(userId: number): void {
      patchState(store, removeEntity(userId));
    },

    clearSessionPeers(): void {
      patchState(store, removeAllEntities());
    },

    applyUserEntityUpdate(user: IUser): void {
      const existing = store.entityMap()[user.id];
      if (existing) {
        patchState(store, setEntity({ ...existing, ...user }));
      }
    },

    applyUserEntityDeleted(userId: number): void {
      if (store.entityMap()[userId]) {
        patchState(store, removeEntity(userId));
      }
    },
  })),
);
