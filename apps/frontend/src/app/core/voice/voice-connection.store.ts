import { computed, inject } from '@angular/core';
import {
  deriveVoiceConnectionState,
  EVoiceConnectionDeadReason,
  EVoiceConnectionState,
  TVoiceTransportState,
} from '@konvoez/shared';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { VoiceSessionStore } from './voice-session.store';
import { VoiceQualityService } from '../services/voice-quality.service';
import { AudioContextResumeService } from '../services/audio-context-resume.service';

type VoiceConnectionState = {
  socketConnected: boolean;
  sendState: TVoiceTransportState | null;
  recvState: TVoiceTransportState | null;
  stalled: boolean;
  recovering: boolean;
  rejoinFailed: boolean;
  dead: EVoiceConnectionDeadReason | null;
  lossReported: boolean;
};

const initialVoiceConnectionState: VoiceConnectionState = {
  socketConnected: true,
  sendState: null,
  recvState: null,
  stalled: false,
  recovering: false,
  rejoinFailed: false,
  dead: null,
  lossReported: false,
};

/**
 * Connection health, transport liveness, recovery escalation, and silent death state.
 * Separate from adaptive quality tiers.
 */
export const VoiceConnectionStore = signalStore(
  { providedIn: 'root' },
  withState<VoiceConnectionState>(initialVoiceConnectionState),
  withComputed(
    (
      store,
      voiceSessionStore = inject(VoiceSessionStore),
      voiceQualityService = inject(VoiceQualityService),
      audioContextResumeService = inject(AudioContextResumeService),
    ) => ({
      state: computed((): EVoiceConnectionState | null => {
        // Read all dependencies first to adhere to Angular reactive guidelines
        const active = voiceSessionStore.activeSession() !== null;
        const socketConnected = store.socketConnected();
        const sendState = store.sendState();
        const recvState = store.recvState();
        const stalled = store.stalled();
        const recovering = store.recovering();
        const rejoinFailed = store.rejoinFailed();
        const dead = store.dead();
        const qualityTier = voiceQualityService.tier();
        const audioSuspended = audioContextResumeService.suspended();

        return deriveVoiceConnectionState({
          active,
          socketConnected,
          sendState,
          recvState,
          stalled,
          recovering,
          rejoinFailed,
          dead,
          qualityTier,
          audioSuspended,
        });
      }),
      audioSuspended: computed(() => audioContextResumeService.suspended()),
    }),
  ),
  withMethods((store) => ({
    setSocketConnected(socketConnected: boolean): void {
      patchState(store, { socketConnected });
    },

    setTransportState(
      direction: 'send' | 'recv',
      state: TVoiceTransportState,
    ): void {
      const nextSendState = direction === 'send' ? state : store.sendState();
      const nextRecvState = direction === 'recv' ? state : store.recvState();

      const shouldClearRecovering =
        store.recovering() &&
        nextSendState === 'connected' &&
        nextRecvState === 'connected';

      patchState(store, {
        ...(direction === 'send' ? { sendState: state } : { recvState: state }),
        ...(shouldClearRecovering ? { recovering: false } : {}),
      });
    },

    setStalled(stalled: boolean): void {
      patchState(store, { stalled });
    },

    setRecovering(recovering: boolean): void {
      patchState(store, { recovering });
    },

    setRejoinFailed(rejoinFailed: boolean): void {
      patchState(store, { rejoinFailed });
    },

    setDead(dead: EVoiceConnectionDeadReason | null): void {
      patchState(store, { dead });
    },

    clearDead(): void {
      patchState(store, { dead: null });
    },

    setLossReported(lossReported: boolean): void {
      patchState(store, { lossReported });
    },

    resetTransports(): void {
      patchState(store, {
        sendState: null,
        recvState: null,
        stalled: false,
      });
    },

    reset(): void {
      patchState(store, {
        sendState: null,
        recvState: null,
        stalled: false,
        recovering: false,
        rejoinFailed: false,
        dead: null,
        lossReported: false,
      });
    },
  })),
);
