import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiHint } from '@taiga-ui/core';
import { EVoiceSessionType, IUser } from '@konvoez/shared';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { UsersStore } from '@features/users/users.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
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
  ],
  templateUrl: './direct.component.html',
  styleUrl: './direct.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectComponent {
  protected readonly directCallService = inject(DirectCallService);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly usersStore = inject(UsersStore);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly voiceLeaveService = inject(VoiceLeaveService);

  protected readonly preferChat = signal(false);

  protected readonly recipientId = toSignal(
    this.activatedRoute.paramMap.pipe(
      map((params) => {
        const id = Number(params.get('id'));
        return Number.isFinite(id) && id > 0 ? id : null;
      }),
    ),
  );

  protected readonly user = computed(() => {
    const id = this.recipientId();
    const entityMap = this.usersStore.entityMap();
    if (!id) {
      return null;
    }
    return entityMap[id] ?? null;
  });

  protected readonly title = computed(() => this.user()?.username ?? '');
  protected readonly avatarUrl = computed(() => this.user()?.avatarUrl ?? null);

  protected readonly isCurrentDirectCallActive = computed(() => {
    const session = this.voiceSessionStore.activeSession();
    const directUser = this.user();
    const interlocutor = this.directCallService.interlocutor();
    const isCallActive = this.directCallService.isCallActive();

    if (
      session?.type === EVoiceSessionType.DIRECT_CALL &&
      directUser &&
      session.interlocutorId === directUser.id
    ) {
      return true;
    }

    return (
      isCallActive &&
      interlocutor !== null &&
      directUser !== null &&
      interlocutor.id === directUser.id
    );
  });

  protected readonly canRejoinCall = computed(() => {
    const isCurrentDirectCallActive = this.isCurrentDirectCallActive();
    const rejoinable = this.directCallService.rejoinableCall();
    const directUser = this.user();

    if (isCurrentDirectCallActive || !rejoinable || !directUser) {
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

    this.activatedRoute.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const id = Number(params.get('id'));
        if (!id || !Number.isFinite(id)) {
          return;
        }
        this.preferChat.set(false);
        void this.directCallService.refreshActiveCall(id);
      });

    effect(() => {
      const isActive = this.isCurrentDirectCallActive();
      untracked(() => {
        if (!isActive) {
          this.preferChat.set(false);
        }
      });
    });
  }

  protected showChat(): void {
    this.preferChat.set(true);
  }

  protected showCall(): void {
    this.preferChat.set(false);
  }

  protected onCallLeft(): void {
    this.preferChat.set(false);
  }

  protected startDirectCall(recipient: IUser): void {
    this.preferChat.set(false);
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
