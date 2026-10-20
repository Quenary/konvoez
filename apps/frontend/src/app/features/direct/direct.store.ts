import { computed, DestroyRef, effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { IUser } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { DirectCallService } from '@core/services/direct-call.service';
import { UsersStore } from '@core/stores/users.store';
import { VoiceLeaveService } from '@core/services/voice-leave.service';

type DirectState = {
  recipientId: number | null;
  preferChat: boolean;
};

export const DirectStore = signalStore(
  withState<DirectState>({
    recipientId: null,
    preferChat: false,
  }),
  withComputed(
    (
      store,
      ngrxStore = inject(Store),
      usersStore = inject(UsersStore),
      translateService = inject(TranslateService),
      directCallService = inject(DirectCallService),
    ) => {
      const currentUser = ngrxStore.selectSignal(selectCurrentUser);

      const user = computed(() => {
        const id = store.recipientId();
        if (!id) {
          return null;
        }
        return usersStore.entityMap()[id] ?? null;
      });

      const isSelf = computed(() => {
        const id = store.recipientId();
        const current = currentUser();
        return id !== null && current !== undefined && id === current?.id;
      });

      const isCurrentDirectCallActive = computed(() => {
        const self = isSelf();
        const recipientId = store.recipientId();
        const callWithUserId = directCallService.callWithUserId();
        if (self) {
          return false;
        }
        return recipientId !== null && callWithUserId === recipientId;
      });

      const canRejoinCall = computed(() => {
        const self = isSelf();
        const active = isCurrentDirectCallActive();
        const rejoinable = directCallService.rejoinableCall();
        const directUser = user();

        if (self || active || !rejoinable || !directUser) {
          return false;
        }
        return (
          rejoinable.callerId === directUser.id ||
          rejoinable.recipientId === directUser.id
        );
      });

      const title = computed(() => {
        const self = isSelf();
        const directUser = user();
        if (self) {
          return translateService.instant('DIRECT.SAVED_MESSAGES');
        }
        return directUser?.username ?? '';
      });

      const avatarUrl = computed(() => {
        const self = isSelf();
        const directUser = user();
        return self ? null : (directUser?.avatarUrl ?? null);
      });

      const avatarIcon = computed(() => (isSelf() ? '@tui.bookmark' : null));

      const isOnline = computed(() => {
        const self = isSelf();
        const directUser = user();
        const onlineMap = usersStore.onlineMap();
        if (self || !directUser) {
          return false;
        }
        return Boolean(onlineMap[directUser.id]);
      });

      const view = computed((): 'call' | 'chat' => {
        const active = isCurrentDirectCallActive();
        const preferChat = store.preferChat();
        if (active && !preferChat) {
          return 'call';
        }
        return 'chat';
      });

      return {
        user,
        isSelf,
        isCurrentDirectCallActive,
        canRejoinCall,
        title,
        avatarUrl,
        avatarIcon,
        isOnline,
        view,
      };
    },
  ),
  withMethods(
    (
      store,
      directCallService = inject(DirectCallService),
      voiceLeaveService = inject(VoiceLeaveService),
    ) => ({
      setRecipientId(recipientId: number | null): void {
        if (store.recipientId() === recipientId) {
          return;
        }
        patchState(store, { recipientId, preferChat: false });
      },

      showChat(): void {
        patchState(store, { preferChat: true });
      },

      showCall(): void {
        patchState(store, { preferChat: false });
      },

      startDirectCall(recipient: IUser): void {
        patchState(store, { preferChat: false });
        void directCallService.initiateCall(recipient);
      },

      rejoinDirectCall(recipient: IUser): void {
        const call = directCallService.rejoinableCall();
        if (!call) {
          return;
        }
        patchState(store, { preferChat: false });
        void directCallService.rejoinCall(call, recipient);
      },

      hangup(): void {
        void voiceLeaveService.leaveActiveVoice();
      },
    }),
  ),
  withHooks({
    onInit(
      store,
      destroyRef = inject(DestroyRef),
      activatedRoute = inject(ActivatedRoute, { optional: true }),
      directCallService = inject(DirectCallService),
      usersStore = inject(UsersStore),
    ) {
      usersStore.loadAll();

      if (activatedRoute) {
        activatedRoute.paramMap
          .pipe(
            map((params) => {
              const id = Number(params.get('id'));
              return Number.isFinite(id) && id > 0 ? id : null;
            }),
            takeUntilDestroyed(destroyRef),
          )
          .subscribe((id) => {
            store.setRecipientId(id);
          });
      }

      effect(() => {
        const id = store.recipientId();
        const isSelf = store.isSelf();
        if (id !== null && !isSelf) {
          untracked(() => {
            void directCallService.refreshActiveCall(id);
          });
        }
      });

      let wasActive = store.isCurrentDirectCallActive();
      effect(() => {
        const isActive = store.isCurrentDirectCallActive();
        if (!isActive && wasActive) {
          untracked(() => {
            patchState(store, { preferChat: false });
          });
        }
        wasActive = isActive;
      });
    },
  }),
);
