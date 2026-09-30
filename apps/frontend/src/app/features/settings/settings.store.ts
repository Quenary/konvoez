import { computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AUDIO_DEVICE_HANDLER } from '@core/tokens/audio-device-handler.token';
import { selectIsAuthorized } from '@features/auth/auth.selectors';
import {
  ESettingKey,
  TIceServersSettingValue,
  TSetting,
  TSettingsUpdate,
  DEFAULT_PASSWORD_RECOVERY_CODE_TTL,
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
import { parseError } from '@shared/functions/parse-error.function';
import { LOCAL_SETTINGS_VERSION } from '@shared/schemas/local-settings.schema';
import { TuiNotificationService } from '@taiga-ui/core';
import { catchError, EMPTY, exhaustMap, filter, pipe, tap } from 'rxjs';
import {
  readLocalSettings,
  writeLocalSettings,
} from './local-settings.storage';
import { SettingsApiService } from './settings-api.service';

export const settingsConfig = entityConfig({
  entity: type<TSetting>(),
  selectId: (setting) => setting.key,
});

export type SettingsStoreState = {
  loading: boolean;
  audioInput: MediaDeviceInfo | null;
  audioOutput: MediaDeviceInfo | null;
  /** Stored schema version; null if LOCAL_SETTINGS is missing / has no version. */
  localSettingsVersion: number | null;
};

export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState<SettingsStoreState>({
    loading: false,
    audioInput: null,
    audioOutput: null,
    localSettingsVersion: null,
  }),
  withEntities(settingsConfig),
  withComputed(({ entities, entityMap, localSettingsVersion }) => ({
    settings: entities,
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
        DEFAULT_PASSWORD_RECOVERY_CODE_TTL
      );
    }),
    needsInitialSetup: computed(
      () => localSettingsVersion() !== LOCAL_SETTINGS_VERSION,
    ),
  })),
  withMethods(
    (
      store,
      settingsApiService = inject(SettingsApiService),
      audioDeviceHandler = inject(AUDIO_DEVICE_HANDLER),
      translateService = inject(TranslateService),
      tuiNotificationsService = inject(TuiNotificationService),
    ) => {
      const showError = (error: unknown): void => {
        tuiNotificationsService
          .open(parseError(error), {
            appearance: 'negative',
            autoClose: 5000,
            closable: true,
            label: translateService.instant('GENERAL.REQ_ERR'),
          })
          .subscribe();
      };

      const persistDevices = (): void => {
        writeLocalSettings({
          audioInput: store.audioInput(),
          audioOutput: store.audioOutput(),
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
            },
            { stampVersion: true },
          );
          patchState(store, { localSettingsVersion: LOCAL_SETTINGS_VERSION });
        },

        setAudioInput(audioInput: MediaDeviceInfo | null): void {
          audioDeviceHandler.setAudioInput(audioInput);
          patchState(store, { audioInput });
          persistDevices();
        },

        setAudioOutput(audioOutput: MediaDeviceInfo | null): void {
          audioDeviceHandler.setAudioOutput(audioOutput);
          patchState(store, { audioOutput });
          persistDevices();
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

      const partial = readLocalSettings();
      const audioInput =
        (partial.audioInput as MediaDeviceInfo | undefined) ?? null;
      const audioOutput =
        (partial.audioOutput as MediaDeviceInfo | undefined) ?? null;

      patchState(store, {
        audioInput,
        audioOutput,
        localSettingsVersion:
          typeof partial.version === 'number' ? partial.version : null,
      });

      if (audioInput) {
        audioDeviceHandler.setAudioInput(audioInput);
      }
      if (audioOutput) {
        audioDeviceHandler.setAudioOutput(audioOutput);
      }

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
