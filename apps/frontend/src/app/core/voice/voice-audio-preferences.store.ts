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

      toggleMicrophoneMuted(): void {
        const microphoneMuted = !store.microphoneMuted();
        patchState(store, { microphoneMuted });
        mediasoupSessionService.setMicrophoneMuted(microphoneMuted);
        if (!microphoneMuted) {
          patchState(store, { speakerMuted: false });
          peerPlaybackService.applySpeakerMuted(false, store.peerGainLevels());
          peerScreenAudioService.applySpeakerMuted(
            false,
            store.peerScreenGainLevels(),
          );
        }
        audioService.playMuteAudio();
      },

      toggleSpeakerMuted(): void {
        const speakerMuted = !store.speakerMuted();
        patchState(store, { speakerMuted });
        peerPlaybackService.applySpeakerMuted(
          speakerMuted,
          store.peerGainLevels(),
        );
        peerScreenAudioService.applySpeakerMuted(
          speakerMuted,
          store.peerScreenGainLevels(),
        );
        if (speakerMuted) {
          patchState(store, { microphoneMuted: true });
          mediasoupSessionService.setMicrophoneMuted(true);
        }
        audioService.playMuteAudio();
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
      effect(() => {
        const value = store.microphoneMuted();
        storageSetItemJson(EStorageKey.MICROPHONE_MUTED, value);
      });

      effect(() => {
        const value = store.speakerMuted();
        storageSetItemJson(EStorageKey.SPEAKER_MUTED, value);
      });
    },
  }),
);
