import { effect, inject } from '@angular/core';
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
  patchState,
  signalStore,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { Store } from '@ngrx/store';
import { VoiceSessionStore } from './voice-session.store';

type VoiceAudioPreferencesState = {
  microphoneMuted: boolean;
  speakerMuted: boolean;
  peerGainLevels: Readonly<Record<number, number>>;
  peerScreenGainLevels: Readonly<Record<number, number>>;
};

function createInitialState(): VoiceAudioPreferencesState {
  return {
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

/**
 * Mute and per-peer gain preferences with localStorage persistence.
 * Syncs mute into mediasoup / playback; registers local audio activity
 * when an active session has an unmuted mic analyser.
 */
export const VoiceAudioPreferencesStore = signalStore(
  { providedIn: 'root' },
  withState(createInitialState),
  withMethods(
    (
      store,
      peerPlaybackService = inject(PeerPlaybackService),
      peerScreenAudioService = inject(PeerScreenAudioService),
      mediasoupSessionService = inject(MediasoupSessionService),
    ) => ({
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
    }),
  ),
  withHooks({
    onInit(store) {
      const microphoneService = inject(MicrophoneService);
      const audioActivityService = inject(AudioActivityService);
      const voiceSessionStore = inject(VoiceSessionStore);
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
        const session = voiceSessionStore.activeSession();
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
