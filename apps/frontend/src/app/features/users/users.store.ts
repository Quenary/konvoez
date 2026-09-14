import { inject } from '@angular/core';
import { IUser } from '@konvoez/shared';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import {
  removeAllEntities,
  setAllEntities,
  withEntities,
} from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { parseError } from '@shared/functions/parse-error.function';
import { TuiNotificationService } from '@taiga-ui/core';
import { catchError, EMPTY, exhaustMap, filter, pipe, tap } from 'rxjs';
import { UsersApiService } from './users-api.service';

type UsersStoreState = {
  loading: boolean;
  loaded: boolean;
};

export const UsersStore = signalStore(
  { providedIn: 'root' },
  withState<UsersStoreState>({
    loading: false,
    loaded: false,
  }),
  withEntities<IUser>(),
  withMethods(
    (
      store,
      usersApiService = inject(UsersApiService),
      translateService = inject(TranslateService),
      tuiNotificationsService = inject(TuiNotificationService),
    ) => ({
      clear(): void {
        patchState(store, removeAllEntities(), {
          loading: false,
          loaded: false,
        });
      },

      loadAll: rxMethod<void>(
        pipe(
          filter(() => !store.loaded()),
          tap(() => patchState(store, { loading: true })),
          exhaustMap(() =>
            usersApiService.list().pipe(
              tap((users) => {
                patchState(store, setAllEntities(users), {
                  loading: false,
                  loaded: true,
                });
              }),
              catchError((error) => {
                patchState(store, { loading: false });
                tuiNotificationsService
                  .open(parseError(error), {
                    appearance: 'negative',
                    autoClose: 5000,
                    closable: true,
                    label: translateService.instant('GENERAL.REQ_ERR'),
                  })
                  .subscribe();
                return EMPTY;
              }),
            ),
          ),
        ),
      ),
    }),
  ),
);
