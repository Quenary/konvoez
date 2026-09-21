import { inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { ETextRoomEvent, ITextRoomMessage, IUser } from '@konvoez/shared';
import {
  patchState,
  signalStore,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import {
  removeAllEntities,
  setAllEntities,
  setEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { parseError } from '@shared/functions/parse-error.function';
import { TuiNotificationService } from '@taiga-ui/core';
import { catchError, EMPTY, fromEvent, pipe, switchMap, tap } from 'rxjs';
import { TextRoomApiService } from '../text-room/text-room-api.service';

type DirectChatsState = {
  loading: boolean;
  loaded: boolean;
};

export const DirectChatsStore = signalStore(
  { providedIn: 'root' },
  withState<DirectChatsState>({
    loading: false,
    loaded: false,
  }),
  withEntities<IUser>(),
  withMethods(
    (
      store,
      textRoomApiService = inject(TextRoomApiService),
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
        clear(): void {
          patchState(store, removeAllEntities(), {
            loading: false,
            loaded: false,
          });
        },

        addOrUpdateChat(user: IUser): void {
          patchState(store, setEntity(user));
        },

        loadDirectChats: rxMethod<void>(
          pipe(
            tap(() => patchState(store, { loading: true })),
            switchMap(() =>
              textRoomApiService.direct().pipe(
                tap((chats) => {
                  patchState(store, setAllEntities(chats), {
                    loading: false,
                    loaded: true,
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
      };
    },
  ),
  withHooks({
    onInit(store) {
      const socket = inject(TextRoomSocketToken);
      const ngrxStore = inject(Store);
      const currentUser = ngrxStore.selectSignal(selectCurrentUser);
      const emitter = socket as never;

      fromEvent<ITextRoomMessage>(emitter, ETextRoomEvent.MESSAGE_CREATED)
        .pipe(takeUntilDestroyed())
        .subscribe((message) => {
          if (message.recipientId) {
            const me = currentUser();
            const interlocutorId =
              message.senderId === me?.id
                ? message.recipientId
                : message.senderId;

            if (interlocutorId && !store.entityMap()[interlocutorId]) {
              store.loadDirectChats();
            }
          }
        });
    },
  }),
);
