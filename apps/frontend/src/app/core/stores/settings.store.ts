import { computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AUDIO_DEVICE_HANDLER } from '@core/tokens/audio-device-handler.token';
import { selectIsAuthorized } from '@core/auth/auth.selectors';
import {
  ESettingKey,
  TIceServersSettingValue,
  TSetting,
  TSettingsUpdate,
  defaultSettingValues,
} from '@konvoez/shared';
import {
  patchState,
  signalStore,
  type,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import {
  entityConfig,
  setAllEntities,
  setEntities,
  withEntities,
} from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { ApiErrorService } from '@core/services/api-error.service';
import {
  DEFAULT_ECHO_CANCELLATION,
  DEFAULT_INPUT_GAIN,
  DEFAULT_NOISE_PROCESSOR,
  DEFAULT_OUTPUT_VOLUME,
  DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN,
  DEFAULT_STREAM_FPS,
  DEFAULT_STREAM_HEIGHT,
  LOCAL_SETTINGS_VERSION,
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';
import { ENoiseProcessor } from '../../app.enums';
import { isMobileOrIos, isSimdSupported } from '@core/audio/audio-capabilities';
import { MicrophoneService } from '@core/services/microphone.service';
import { SpeakerService } from '@core/services/speaker.service';
import { TuiNotificationService } from '@taiga-ui/core';
import { catchError, EMPTY, exhaustMap, filter, pipe, tap } from 'rxjs';
import {
  readLocalSettings,
  writeLocalSettings,
} from './local-settings.storage';
import { SettingsApiService } from '@core/api/settings-api.service';

export const settingsConfig = entityConfig({
  entity: type<TSetting>(),
  selectId: (setting) => setting.key,
});

export type SettingsStoreState = {
  loading: boolean;
  audioInput: MediaDeviceInfo | null;
  audioOutput: MediaDeviceInfo | null;
  videoInput: MediaDeviceInfo | null;
  streamHeight: TStreamHeight;
  streamFps: TStreamFps;
  screenHeight: TStreamHeight;
  screenFps: TStreamFps;
  screenPreviewAutoPauseWhenHidden: boolean;
  noiseProcessor: ENoiseProcessor;
  inputGain: number;
  outputVolume: number;
  echoCancellation: boolean;
  /** Stored schema version; null if LOCAL_SETTINGS is missing / has no version. */
  localSettingsVersion: number | null;
};

export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState<SettingsStoreState>({
    loading: false,
    audioInput: null,
    audioOutput: null,
    videoInput: null,
    streamHeight: DEFAULT_STREAM_HEIGHT,
    streamFps: DEFAULT_STREAM_FPS,
    screenHeight: DEFAULT_STREAM_HEIGHT,
    screenFps: DEFAULT_STREAM_FPS,
    screenPreviewAutoPauseWhenHidden:
      DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN,
    noiseProcessor: DEFAULT_NOISE_PROCESSOR,
    inputGain: DEFAULT_INPUT_GAIN,
    outputVolume: DEFAULT_OUTPUT_VOLUME,
    echoCancellation: DEFAULT_ECHO_CANCELLATION,
    localSettingsVersion: null,
  }),
  withEntities(settingsConfig),
  withComputed(
    ({ entities, entityMap, localSettingsVersion, noiseProcessor }) => ({
      settings: entities,
      effectiveNoiseProcessor: computed(() =>
        noiseProcessor() === ENoiseProcessor.DEEPFILTER && !isSimdSupported()
          ? ENoiseProcessor.RNNOISE
          : noiseProcessor(),
      ),
      settingsMap: computed(() => {
        const map = new Map<ESettingKey, TSetting['value']>();
        for (const item of entities()) {
          map.set(item.key, item.value);
        }
        return map;
      }),
      iceServers: computed(() => {
        const item = entityMap()[ESettingKey.ICE_SERVERS];
        return (item?.value as TIceServersSettingValue | undefined) ?? [];
      }),
      inviteOnlySignUp: computed(() => {
        const item = entityMap()[ESettingKey.INVITE_ONLY_SIGN_UP];
        return (item?.value as boolean | undefined) ?? true;
      }),
      passwordRecoveryCodeTtl: computed(() => {
        const item = entityMap()[ESettingKey.PASSWORD_RECOVERY_CODE_TTL];
        return (
          (item?.value as number | undefined) ??
          defaultSettingValues[ESettingKey.PASSWORD_RECOVERY_CODE_TTL]
        );
      }),
      vapidEmail: computed(() => {
        const item = entityMap()[ESettingKey.VAPID_EMAIL];
        return (
          (item?.value as string | undefined) ??
          defaultSettingValues[ESettingKey.VAPID_EMAIL]
        );
      }),
      envLocked: computed(
        () =>
          Object.fromEntries(
            Object.values(ESettingKey).map((key) => [
              key,
              entityMap()[key]?.envLocked ?? false,
            ]),
          ) as Record<ESettingKey, boolean>,
      ),
      attachmentsEnabled: computed(() => {
        const item = entityMap()[ESettingKey.ATTACHMENTS_ENABLED];
        return (
          (item?.value as boolean | undefined) ??
          defaultSettingValues[ESettingKey.ATTACHMENTS_ENABLED]
        );
      }),
      attachmentsMaxFileSize: computed(() => {
        const item = entityMap()[ESettingKey.ATTACHMENTS_MAX_FILE_SIZE];
        return (
          (item?.value as number | undefined) ??
          defaultSettingValues[ESettingKey.ATTACHMENTS_MAX_FILE_SIZE]
        );
      }),
      attachmentsMaxFilesPerMessage: computed(() => {
        const item = entityMap()[ESettingKey.ATTACHMENTS_MAX_FILES_PER_MESSAGE];
        return (
          (item?.value as number | undefined) ??
          defaultSettingValues[ESettingKey.ATTACHMENTS_MAX_FILES_PER_MESSAGE]
        );
      }),
      attachmentsStripImageMetadata: computed(() => {
        const item = entityMap()[ESettingKey.ATTACHMENTS_STRIP_IMAGE_METADATA];
        return (
          (item?.value as boolean | undefined) ??
          defaultSettingValues[ESettingKey.ATTACHMENTS_STRIP_IMAGE_METADATA]
        );
      }),
      needsInitialSetup: computed(
        () => localSettingsVersion() !== LOCAL_SETTINGS_VERSION,
      ),
    }),
  ),
  withMethods(
    (
      store,
      settingsApiService = inject(SettingsApiService),
      audioDeviceHandler = inject(AUDIO_DEVICE_HANDLER),
      microphoneService = inject(MicrophoneService),
      speakerService = inject(SpeakerService),
      translateService = inject(TranslateService),
      tuiNotificationsService = inject(TuiNotificationService),
      apiErrorService = inject(ApiErrorService),
    ) => {
      const showError = (error: unknown): void => {
        tuiNotificationsService
          .open(apiErrorService.translate(error, 'GENERAL.REQ_ERR'), {
            appearance: 'negative',
            autoClose: 5000,
            closable: true,
            label: translateService.instant('GENERAL.REQ_ERR'),
          })
          .subscribe();
      };

      const persistLocal = (): void => {
        writeLocalSettings({
          audioInput: store.audioInput(),
          audioOutput: store.audioOutput(),
          videoInput: store.videoInput(),
          streamHeight: store.streamHeight(),
          streamFps: store.streamFps(),
          screenHeight: store.screenHeight(),
          screenFps: store.screenFps(),
          screenPreviewAutoPauseWhenHidden:
            store.screenPreviewAutoPauseWhenHidden(),
          noiseProcessor: store.noiseProcessor(),
          inputGain: store.inputGain(),
          outputVolume: store.outputVolume(),
          echoCancellation: store.echoCancellation(),
        });
      };

      return {
        /**
         * Persist devices and stamp the current schema version (setup complete).
         */
        persistLocalSettings(): void {
          writeLocalSettings(
            {
              audioInput: store.audioInput(),
              audioOutput: store.audioOutput(),
              videoInput: store.videoInput(),
              streamHeight: store.streamHeight(),
              streamFps: store.streamFps(),
              screenHeight: store.screenHeight(),
              screenFps: store.screenFps(),
              screenPreviewAutoPauseWhenHidden:
                store.screenPreviewAutoPauseWhenHidden(),
              noiseProcessor: store.noiseProcessor(),
              inputGain: store.inputGain(),
              outputVolume: store.outputVolume(),
              echoCancellation: store.echoCancellation(),
            },
            { stampVersion: true },
          );
          patchState(store, { localSettingsVersion: LOCAL_SETTINGS_VERSION });
        },

        setAudioInput(audioInput: MediaDeviceInfo | null): void {
          audioDeviceHandler.setAudioInput(audioInput);
          patchState(store, { audioInput });
          persistLocal();
        },

        setAudioOutput(audioOutput: MediaDeviceInfo | null): void {
          audioDeviceHandler.setAudioOutput(audioOutput);
          patchState(store, { audioOutput });
          persistLocal();
        },

        setVideoInput(videoInput: MediaDeviceInfo | null): void {
          patchState(store, { videoInput });
          persistLocal();
        },

        setStreamHeight(streamHeight: TStreamHeight): void {
          patchState(store, { streamHeight });
          persistLocal();
        },

        setStreamFps(streamFps: TStreamFps): void {
          patchState(store, { streamFps });
          persistLocal();
        },

        setScreenHeight(screenHeight: TStreamHeight): void {
          patchState(store, { screenHeight });
          persistLocal();
        },

        setScreenFps(screenFps: TStreamFps): void {
          patchState(store, { screenFps });
          persistLocal();
        },

        setScreenPreviewAutoPauseWhenHidden(
          screenPreviewAutoPauseWhenHidden: boolean,
        ): void {
          patchState(store, { screenPreviewAutoPauseWhenHidden });
          persistLocal();
        },

        setNoiseProcessor(noiseProcessor: ENoiseProcessor): void {
          patchState(store, { noiseProcessor });
          persistLocal();
          void microphoneService.setProcessor(store.effectiveNoiseProcessor());
        },

        setInputGain(inputGain: number): void {
          patchState(store, { inputGain });
          persistLocal();
          microphoneService.setGain(inputGain);
        },

        setOutputVolume(outputVolume: number): void {
          patchState(store, { outputVolume });
          persistLocal();
          speakerService.setMasterVolume(outputVolume);
        },

        setEchoCancellation(echoCancellation: boolean): void {
          patchState(store, { echoCancellation });
          persistLocal();
          void microphoneService.setEchoCancellation(echoCancellation);
        },

        loadAll: rxMethod<void>(
          pipe(
            filter(() => !store.loading()),
            tap(() => patchState(store, { loading: true })),
            exhaustMap(() =>
              settingsApiService.list().pipe(
                tap((settings) => {
                  patchState(store, setAllEntities(settings, settingsConfig), {
                    loading: false,
                  });
                }),
                catchError((error) => {
                  patchState(store, { loading: false });
                  showError(error);
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),

        updateSettings: rxMethod<TSettingsUpdate>(
          pipe(
            exhaustMap((settings) =>
              settingsApiService.update(settings).pipe(
                tap((updatedSettings) => {
                  patchState(
                    store,
                    setEntities(updatedSettings, settingsConfig),
                  );
                  tuiNotificationsService
                    .open(
                      translateService.instant('SETTINGS.ADMIN.SAVED_SUCCESS'),
                      {
                        appearance: 'positive',
                        autoClose: 3000,
                      },
                    )
                    .subscribe();
                }),
                catchError((error) => {
                  showError(error);
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),
      };
    },
  ),
  withHooks({
    onInit(store) {
      const ngrxStore = inject(Store);
      const audioDeviceHandler = inject(AUDIO_DEVICE_HANDLER);
      const microphoneService = inject(MicrophoneService);
      const speakerService = inject(SpeakerService);

      const partial = readLocalSettings();
      const audioInput =
        (partial.audioInput as MediaDeviceInfo | undefined) ?? null;
      const audioOutput =
        (partial.audioOutput as MediaDeviceInfo | undefined) ?? null;
      const videoInput =
        (partial.videoInput as MediaDeviceInfo | undefined) ?? null;
      const preferredProcessor =
        partial.noiseProcessor ??
        (isMobileOrIos()
          ? ENoiseProcessor.RNNOISE
          : ENoiseProcessor.DEEPFILTER);
      const inputGain = partial.inputGain ?? DEFAULT_INPUT_GAIN;
      const outputVolume = partial.outputVolume ?? DEFAULT_OUTPUT_VOLUME;
      const echoCancellation =
        partial.echoCancellation ?? DEFAULT_ECHO_CANCELLATION;

      patchState(store, {
        audioInput,
        audioOutput,
        videoInput,
        streamHeight: partial.streamHeight ?? DEFAULT_STREAM_HEIGHT,
        streamFps: partial.streamFps ?? DEFAULT_STREAM_FPS,
        screenHeight: partial.screenHeight ?? DEFAULT_STREAM_HEIGHT,
        screenFps: partial.screenFps ?? DEFAULT_STREAM_FPS,
        screenPreviewAutoPauseWhenHidden:
          partial.screenPreviewAutoPauseWhenHidden ??
          DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN,
        noiseProcessor: preferredProcessor,
        inputGain,
        outputVolume,
        echoCancellation,
        localSettingsVersion:
          typeof partial.version === 'number' ? partial.version : null,
      });

      if (audioInput) {
        audioDeviceHandler.setAudioInput(audioInput);
      }
      if (audioOutput) {
        audioDeviceHandler.setAudioOutput(audioOutput);
      }

      microphoneService.setGain(inputGain);
      void microphoneService.setProcessor(store.effectiveNoiseProcessor());
      void microphoneService.setEchoCancellation(echoCancellation);
      speakerService.setMasterVolume(outputVolume);

      ngrxStore
        .select(selectIsAuthorized)
        .pipe(takeUntilDestroyed())
        .subscribe((isAuthorized) => {
          if (isAuthorized) {
            store.loadAll();
          }
        });
    },
  }),
);
