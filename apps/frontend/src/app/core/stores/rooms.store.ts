import { computed, inject } from '@angular/core';
import { ERoomType, IRoom, IRoomCreate, IRoomUpdate } from '@konvoez/shared';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import {
  removeEntity,
  setAllEntities,
  setEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { parseError } from '@shared/functions/parse-error.function';
import { TuiNotificationService } from '@taiga-ui/core';
import { catchError, EMPTY, pipe, switchMap, tap } from 'rxjs';
import { RoomsApiService } from '@core/api/rooms-api.service';

type RoomsStoreState = {
  selectedRoomId: number | null;
};

const sortByName = (a: IRoom, b: IRoom): number => a.name.localeCompare(b.name);

export const RoomsStore = signalStore(
  { providedIn: 'root' },
  withState<RoomsStoreState>({
    selectedRoomId: null,
  }),
  withEntities<IRoom>(),
  withComputed(({ entities, entityMap }) => ({
    roomsDict: entityMap,
    textRooms: computed(() =>
      entities()
        .filter((room) => room.type === ERoomType.TEXT)
        .sort(sortByName),
    ),
    voiceRooms: computed(() =>
      entities()
        .filter((room) => room.type === ERoomType.VOICE)
        .sort(sortByName),
    ),
  })),
  withMethods(
    (
      store,
      roomsApiService = inject(RoomsApiService),
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

      const upsertOne = (room: IRoom): void => {
        patchState(store, setEntity(room));
      };

      const removeOne = (id: number): void => {
        patchState(store, removeEntity(id), {
          selectedRoomId:
            store.selectedRoomId() === id ? null : store.selectedRoomId(),
        });
      };

      const setSelectedRoomId = (id: number | null): void => {
        patchState(store, { selectedRoomId: id });
      };

      return {
        upsertOne,
        removeOne,
        setSelectedRoomId,

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
            switchMap((body) =>
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
            switchMap(({ id, room }) =>
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
            switchMap((id) =>
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
      };
    },
  ),
);
