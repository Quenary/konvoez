import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiGroup, TuiHint } from '@taiga-ui/core';
import { IUser } from '@konvoez/shared';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { UsersStore } from '@core/stores/users.store';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { TranslateService } from '@ngx-translate/core';
import { ChatComponent } from '@shared/components/chat/chat.component';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { VoiceRoomShellComponent } from '@shared/components/voice-room/voice-room-shell/voice-room-shell.component';

@Component({
  selector: 'app-direct',
  imports: [
    ChatComponent,
    VoiceRoomShellComponent,
    PulseIndicatorComponent,
    TuiButton,
    TuiHint,
    TranslatePipe,
    TuiGroup,
  ],
  templateUrl: './direct.component.html',
  styleUrl: './direct.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectComponent {
  protected readonly directCallService = inject(DirectCallService);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly usersStore = inject(UsersStore);
  private readonly voiceLeaveService = inject(VoiceLeaveService);
  private readonly ngrxStore = inject(Store);
  private readonly translateService = inject(TranslateService);

  private readonly currentUser = this.ngrxStore.selectSignal(selectCurrentUser);

  protected readonly recipientId = toSignal(
    this.activatedRoute.paramMap.pipe(
      map((params) => {
        const id = Number(params.get('id'));
        return Number.isFinite(id) && id > 0 ? id : null;
      }),
    ),
    { initialValue: null },
  );

  protected readonly isSelf = computed(() => {
    const id = this.recipientId();
    const current = this.currentUser();
    return id !== null && current !== undefined && id === current?.id;
  });

  /** True when the route recipient matches the active direct call target. */
  protected readonly isCurrentDirectCallActive = computed(() => {
    const isSelf = this.isSelf();
    const recipientId = this.recipientId();
    const callWithUserId = this.directCallService.callWithUserId();
    if (isSelf) {
      return false;
    }
    return recipientId !== null && callWithUserId === recipientId;
  });

  protected readonly preferChat = linkedSignal({
    source: () => this.isCurrentDirectCallActive(),
    computation: (isActive, previous) =>
      isActive ? (previous?.value ?? false) : false,
  });

  protected readonly user = computed(() => {
    const id = this.recipientId();
    const entityMap = this.usersStore.entityMap();
    if (!id) {
      return null;
    }
    return entityMap[id] ?? null;
  });

  protected readonly title = computed(() => {
    const isSelf = this.isSelf();
    const user = this.user();
    if (isSelf) {
      return this.translateService.instant('DIRECT.SAVED_MESSAGES');
    }
    return user?.username ?? '';
  });

  protected readonly avatarUrl = computed(() =>
    this.isSelf() ? null : (this.user()?.avatarUrl ?? null),
  );

  protected readonly avatarIcon = computed(() =>
    this.isSelf() ? '@tui.bookmark' : null,
  );

  protected readonly canRejoinCall = computed(() => {
    const isSelf = this.isSelf();
    const isCurrentDirectCallActive = this.isCurrentDirectCallActive();
    const rejoinable = this.directCallService.rejoinableCall();
    const directUser = this.user();

    if (isSelf || isCurrentDirectCallActive || !rejoinable || !directUser) {
      return false;
    }
    return (
      rejoinable.callerId === directUser.id ||
      rejoinable.recipientId === directUser.id
    );
  });

  protected readonly view = computed(() => {
    const isActive = this.isCurrentDirectCallActive();
    const preferChat = this.preferChat();
    if (isActive && !preferChat) {
      return 'call' as const;
    }
    return 'chat' as const;
  });

  constructor() {
    this.usersStore.loadAll();

    effect(() => {
      const id = this.recipientId();
      const isSelf = this.isSelf();
      if (id !== null && !isSelf) {
        untracked(() => {
          void this.directCallService.refreshActiveCall(id);
        });
      }
    });
  }

  protected showChat(): void {
    this.preferChat.set(true);
  }

  protected showCall(): void {
    this.preferChat.set(false);
  }

  protected startDirectCall(recipient: IUser): void {
    void this.directCallService.initiateCall(recipient);
  }

  protected rejoinDirectCall(recipient: IUser): void {
    const call = this.directCallService.rejoinableCall();
    if (!call) {
      return;
    }
    this.preferChat.set(false);
    void this.directCallService.rejoinCall(call, recipient);
  }

  protected hangup(): void {
    void this.voiceLeaveService.leaveActiveVoice();
  }
}
