import { computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IRole } from '@konvoez/shared';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
} from '@ngrx/signals';
import {
  removeAllEntities,
  removeEntity,
  setAllEntities,
  setEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Store } from '@ngrx/store';
import { catchError, EMPTY, pipe, switchMap, tap } from 'rxjs';
import { selectIsAuthorized } from '@core/auth/auth.selectors';
import { RolesApiService } from '@core/api/roles-api.service';

export const RolesStore = signalStore(
  { providedIn: 'root' },
  withEntities<IRole>(),
  withComputed(({ entities, entityMap }) => ({
    rolesById: computed(() => entityMap() as Record<number, IRole>),
    mentionableRoles: computed(() =>
      entities().filter((role) => Boolean(role.mentionable)),
    ),
  })),
  withMethods((store, rolesApiService = inject(RolesApiService)) => ({
    clear(): void {
      patchState(store, removeAllEntities());
    },

    upsertOne(role: IRole): void {
      patchState(store, setEntity(role));
    },

    removeOne(id: number): void {
      patchState(store, removeEntity(id));
    },

    loadAll: rxMethod<void>(
      pipe(
        switchMap(() =>
          rolesApiService.findAll().pipe(
            tap((roles) => {
              patchState(store, setAllEntities(roles));
            }),
            catchError(() => EMPTY),
          ),
        ),
      ),
    ),
  })),
  withHooks({
    onInit(store) {
      const ngrxStore = inject(Store);
      ngrxStore
        .select(selectIsAuthorized)
        .pipe(takeUntilDestroyed())
        .subscribe((isAuthorized) => {
          if (isAuthorized) {
            store.loadAll();
          } else {
            store.clear();
          }
        });
    },
  }),
);
