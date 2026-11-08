import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  signalStore,
  withComputed,
  withMethods,
  withProps,
} from '@ngrx/signals';
import { IPublicSettings } from '@konvoez/shared';
import { catchError, of } from 'rxjs';
import { PublicApiService } from '@core/services/public-api.service';

export const DEFAULT_PUBLIC_SETTINGS: IPublicSettings = {
  isOwnerSetupRequired: false,
  inviteOnlySignUp: false,
  smtpConfigured: false,
  appUrlConfigured: false,
};

export const PublicStore = signalStore(
  { providedIn: 'root' },
  withProps((_, publicApiService = inject(PublicApiService)) => ({
    publicSettings: rxResource<IPublicSettings, unknown>({
      stream: () =>
        publicApiService
          .getSettings()
          .pipe(catchError(() => of(DEFAULT_PUBLIC_SETTINGS))),
    }),
  })),
  withComputed(({ publicSettings }) => ({
    settings: computed(() => publicSettings.value() ?? null),
    isSmtpConfigured: computed(
      () => publicSettings.value()?.smtpConfigured ?? false,
    ),
    inviteOnlySignUp: computed(
      () => publicSettings.value()?.inviteOnlySignUp ?? false,
    ),
    isOwnerSetupRequired: computed(
      () => publicSettings.value()?.isOwnerSetupRequired ?? false,
    ),
    isAppUrlConfigured: computed(
      () => publicSettings.value()?.appUrlConfigured ?? false,
    ),
  })),
  withMethods(({ publicSettings }) => ({
    reload(): boolean {
      return publicSettings.reload();
    },
  })),
);
