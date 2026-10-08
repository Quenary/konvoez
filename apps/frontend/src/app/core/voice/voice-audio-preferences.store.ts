import { effect, inject } from '@angular/core';
import { AudioService } from '@core/services/audio.service';
import { MediasoupSessionService } from '@core/services/mediasoup-session.service';
import { PeerPlaybackService } from '@core/services/peer-playback.service';
import { PeerScreenAudioService } from '@core/services/peer-screen-audio.service';
import {
  storageGetItemJson,
  storageSetItemJson,
} from '../../../extentions/local-storage-json';
import { EStorageKey } from '../../app.enums';
import {
  patchState,
  signalStore,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

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
 * Syncs mute into mediasoup / playback.
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
      audioService = inject(AudioService),
    ) => {
      const setMic = (microphoneMuted: boolean): void => {
        patchState(store, { microphoneMuted });
        mediasoupSessionService.setMicrophoneMuted(microphoneMuted);
      };

      const setSpeaker = (speakerMuted: boolean): void => {
        patchState(store, { speakerMuted });
        peerPlaybackService.applySpeakerMuted(
          speakerMuted,
          store.peerGainLevels(),
        );
        peerScreenAudioService.applySpeakerMuted(
          speakerMuted,
          store.peerScreenGainLevels(),
        );
      };

      return {
        setMicrophoneMuted(microphoneMuted: boolean): void {
          setMic(microphoneMuted);
        },

        setSpeakerMuted(speakerMuted: boolean): void {
          setSpeaker(speakerMuted);
        },

        /**
         * Toggles microphone mute state and un-deafens if unmuted.
         * Plays mute/unmute audio SFX via {@link AudioService}.
         */
        toggleMicrophoneMuted(): void {
          const microphoneMuted = !store.microphoneMuted();
          setMic(microphoneMuted);
          if (!microphoneMuted) {
            setSpeaker(false);
          }
          audioService.playMuteAudio();
        },

        /**
         * Toggles speaker mute state and mutes microphone if deafened.
         * Plays mute/unmute audio SFX via {@link AudioService}.
         */
        toggleSpeakerMuted(): void {
          const speakerMuted = !store.speakerMuted();
          setSpeaker(speakerMuted);
          if (speakerMuted) {
            setMic(true);
          }
          audioService.playMuteAudio();
        },

        setPeerGain(userId: number, gain: number): void {
          patchState(store, (state) => ({
            peerGainLevels: {
              ...state.peerGainLevels,
              [userId]: gain,
            },
          }));
          peerPlaybackService.setPeerGain(userId, gain, store.speakerMuted());
        },

        setPeerScreenGain(userId: number, gain: number): void {
          patchState(store, (state) => ({
            peerScreenGainLevels: {
              ...state.peerScreenGainLevels,
              [userId]: gain,
            },
          }));
          peerScreenAudioService.setGain(userId, gain, store.speakerMuted());
        },
      };
    },
  ),
  withHooks({
    onInit(store) {
      effect(() => {
        const value = store.microphoneMuted();
        storageSetItemJson(EStorageKey.MICROPHONE_MUTED, value);
      });

      effect(() => {
        const value = store.speakerMuted();
        storageSetItemJson(EStorageKey.SPEAKER_MUTED, value);
      });

      effect(() => {
        const value = store.peerGainLevels();
        storageSetItemJson(EStorageKey.PEER_GAIN_LEVELS, value);
      });

      effect(() => {
        const value = store.peerScreenGainLevels();
        storageSetItemJson(EStorageKey.PEER_SCREEN_GAIN_LEVELS, value);
      });
    },
  }),
);
