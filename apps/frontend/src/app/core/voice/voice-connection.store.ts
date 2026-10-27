import { computed, inject } from '@angular/core';
import {
  deriveVoiceConnectionState,
  EVoiceConnectionDeadReason,
  EVoiceConnectionState,
  EVoiceQualityTier,
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
import { MicrophoneService } from '../services/microphone.service';
import { AudioContextResumeService } from '../services/audio-context-resume.service';

type VoiceConnectionState = {
  socketConnected: boolean;
  sendState: TVoiceTransportState | null;
  recvState: TVoiceTransportState | null;
  stalled: boolean;
  recovering: boolean;
  dead: EVoiceConnectionDeadReason | null;
  lossReported: boolean;
  micFailed: boolean;
};

const initialVoiceConnectionState: VoiceConnectionState = {
  socketConnected: true,
  sendState: null,
  recvState: null,
  stalled: false,
  recovering: false,
  dead: null,
  lossReported: false,
  micFailed: false,
};

const UNHEALTHY_TRANSPORT_STATES: ReadonlySet<TVoiceTransportState> = new Set([
  'connecting',
  'disconnected',
  'failed',
  'closed',
]);

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
      microphoneService = inject(MicrophoneService),
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
        const dead = store.dead();
        const qualityTier =
          typeof voiceQualityService?.tier === 'function'
            ? voiceQualityService.tier()
            : EVoiceQualityTier.EXCELLENT;
        const micFailed = store.micFailed();
        const micInputMuted =
          typeof microphoneService?.inputMuted === 'function'
            ? microphoneService.inputMuted()
            : false;
        const audioSuspended =
          typeof audioContextResumeService?.suspended === 'function'
            ? audioContextResumeService.suspended()
            : false;

        return deriveVoiceConnectionState({
          active,
          socketConnected,
          sendState,
          recvState,
          stalled,
          recovering,
          dead,
          qualityTier,
          micFailed,
          micInputMuted,
          audioSuspended,
        });
      }),
      micInputMuted: computed(() =>
        typeof microphoneService?.inputMuted === 'function'
          ? microphoneService.inputMuted()
          : false,
      ),
      audioSuspended: computed(() =>
        typeof audioContextResumeService?.suspended === 'function'
          ? audioContextResumeService.suspended()
          : false,
      ),
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

      const isUnhealthy =
        (nextSendState !== null &&
          UNHEALTHY_TRANSPORT_STATES.has(nextSendState)) ||
        (nextRecvState !== null &&
          UNHEALTHY_TRANSPORT_STATES.has(nextRecvState));

      const shouldClearRecovering =
        store.recovering() && nextSendState === 'connected' && !isUnhealthy;

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

    setDead(dead: EVoiceConnectionDeadReason | null): void {
      patchState(store, { dead });
    },

    clearDead(): void {
      patchState(store, { dead: null });
    },

    setLossReported(lossReported: boolean): void {
      patchState(store, { lossReported });
    },

    setMicFailed(micFailed: boolean): void {
      patchState(store, { micFailed });
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
        dead: null,
        lossReported: false,
        micFailed: false,
      });
    },
  })),
);
