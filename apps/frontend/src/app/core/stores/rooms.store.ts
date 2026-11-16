import { computed, inject } from '@angular/core';
import { ERoomType, IRoom, IRoomCreate, IRoomUpdate } from '@konvoez/shared';
import {
  patchState,
  signalStore,
  withComputed,
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
import { TranslateService } from '@ngx-translate/core';
import { ApiErrorService } from '@core/services/api-error.service';
import { TuiNotificationService } from '@taiga-ui/core';
import {
  catchError,
  concatMap,
  EMPTY,
  mergeMap,
  pipe,
  switchMap,
  tap,
} from 'rxjs';
import { RoomsApiService } from '@core/api/rooms-api.service';

const sortByOrder = (a: IRoom, b: IRoom): number => {
  const orderDiff = (a.order ?? 0) - (b.order ?? 0);
  if (orderDiff !== 0) {
    return orderDiff;
  }
  return a.name.localeCompare(b.name);
};

export const RoomsStore = signalStore(
  { providedIn: 'root' },
  withEntities<IRoom>(),
  withComputed(({ entities, entityMap }) => ({
    roomsDict: entityMap,
    textRooms: computed(() =>
      entities()
        .filter((room) => room.type === ERoomType.TEXT)
        .sort(sortByOrder),
    ),
    voiceRooms: computed(() =>
      entities()
        .filter((room) => room.type === ERoomType.VOICE)
        .sort(sortByOrder),
    ),
  })),
  withMethods(
    (
      store,
      roomsApiService = inject(RoomsApiService),
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

      const upsertOne = (room: IRoom): void => {
        patchState(store, setEntity(room));
      };

      const removeOne = (id: number): void => {
        patchState(store, removeEntity(id));
      };

      const clear = (): void => {
        patchState(store, removeAllEntities());
      };

      return {
        upsertOne,
        removeOne,
        clear,

        loadAll: rxMethod<void>(
          pipe(
            switchMap(() =>
              roomsApiService.list().pipe(
                tap((rooms) => {
                  patchState(store, setAllEntities(rooms));
                }),
                catchError((error) => {
                  showError(error);
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),

        loadOne: rxMethod<number>(
          pipe(
            switchMap((id) =>
              roomsApiService.read(id).pipe(
                tap((room) => {
                  upsertOne(room);
                }),
                catchError((error) => {
                  showError(error);
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),

        create: rxMethod<IRoomCreate>(
          pipe(
            mergeMap((body) =>
              roomsApiService.create(body).pipe(
                tap((room) => {
                  upsertOne(room);
                }),
                catchError((error) => {
                  showError(error);
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),

        update: rxMethod<{ id: number; room: IRoomUpdate }>(
          pipe(
            mergeMap(({ id, room }) =>
              roomsApiService.update(id, room).pipe(
                tap((updated) => {
                  upsertOne(updated);
                }),
                catchError((error) => {
                  showError(error);
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),

        remove: rxMethod<number>(
          pipe(
            mergeMap((id) =>
              roomsApiService.remove(id).pipe(
                tap(() => {
                  removeOne(id);
                }),
                catchError((error) => {
                  showError(error);
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),

        reorder: rxMethod<number[]>(
          pipe(
            tap((roomIds) => {
              const currentEntities = store.entities();
              const roomMap = new Map(currentEntities.map((r) => [r.id, r]));
              const updatedRooms: IRoom[] = [];
              for (let i = 0; i < roomIds.length; i++) {
                const room = roomMap.get(roomIds[i]);
                if (room && room.order !== i) {
                  updatedRooms.push({ ...room, order: i });
                }
              }
              if (updatedRooms.length > 0) {
                patchState(
                  store,
                  ...updatedRooms.map((room) => setEntity(room)),
                );
              }
            }),
            concatMap((roomIds) =>
              roomsApiService.reorder(roomIds).pipe(
                tap((updated) => {
                  patchState(store, ...updated.map((r) => setEntity(r)));
                }),
                catchError((error) => {
                  showError(error);
                  return roomsApiService.list().pipe(
                    tap((rooms) => {
                      patchState(store, setAllEntities(rooms));
                    }),
                    catchError(() => EMPTY),
                  );
                }),
              ),
            ),
          ),
        ),
      };
    },
  ),
);
