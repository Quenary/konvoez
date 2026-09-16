import { computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AUDIO_DEVICE_HANDLER } from '@core/tokens/audio-device-handler.token';
import { selectIsAuthorized } from '@features/auth/auth.selectors';
import {
  ESettingKey,
  TIceServersSettingValue,
  TSetting,
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
  setEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { parseError } from '@shared/functions/parse-error.function';
import { TuiNotificationService } from '@taiga-ui/core';
import { catchError, EMPTY, exhaustMap, filter, pipe, tap } from 'rxjs';
import { EStorageKey } from '../../app.enums';
import {
  storageGetItemJson,
  storageSetItemJson,
} from '../../../extentions/local-storage-json';
import { SettingsApiService } from './settings-api.service';

export const settingsConfig = entityConfig({
  entity: type<TSetting>(),
  selectId: (setting) => setting.key,
});

export type SettingsStoreState = {
  loading: boolean;
  audioInput: MediaDeviceInfo | null;
  audioOutput: MediaDeviceInfo | null;
};

export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState<SettingsStoreState>({
    loading: false,
    audioInput: null,
    audioOutput: null,
  }),
  withEntities(settingsConfig),
  withComputed(({ entities, entityMap }) => ({
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

      return {
        setAudioInput(audioInput: MediaDeviceInfo | null): void {
          if (audioInput) {
            storageSetItemJson(EStorageKey.AUDIO_INPUT, audioInput);
          } else {
            localStorage.removeItem(EStorageKey.AUDIO_INPUT);
          }
          audioDeviceHandler.setAudioInput(audioInput);
          patchState(store, { audioInput });
        },

        setAudioOutput(audioOutput: MediaDeviceInfo | null): void {
          if (audioOutput) {
            storageSetItemJson(EStorageKey.AUDIO_OUTPUT, audioOutput);
          } else {
            localStorage.removeItem(EStorageKey.AUDIO_OUTPUT);
          }
          audioDeviceHandler.setAudioOutput(audioOutput);
          patchState(store, { audioOutput });
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

        updateSetting: rxMethod<{ key: ESettingKey; value: unknown }>(
          pipe(
            exhaustMap(({ key, value }) =>
              settingsApiService.update(key, value).pipe(
                tap((updated) => {
                  patchState(store, setEntity(updated, settingsConfig));
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

      const audioInput = storageGetItemJson<MediaDeviceInfo>(
        EStorageKey.AUDIO_INPUT,
      );
      const audioOutput = storageGetItemJson<MediaDeviceInfo>(
        EStorageKey.AUDIO_OUTPUT,
      );

      patchState(store, { audioInput, audioOutput });
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
