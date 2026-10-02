import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  Sanitizer,
  SecurityContext,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TuiButton,
  TuiDataList,
  TuiDialogService,
  TuiDropdown,
  TuiHint,
  TuiIcon,
  TuiLoader,
  TuiNotificationService,
  TuiOption,
} from '@taiga-ui/core';
import { TuiEditorSocket } from '@taiga-ui/editor';
import { TuiAutoColorPipe } from '@taiga-ui/kit';
import {
  canDeleteTextRoomMessage,
  ITextRoomMessageReply,
  IUser,
} from '@konvoez/shared';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { DayjsPipe } from '@shared/pipes/dayjs.pipe';
import { UsersStore } from '@features/users/users.store';
import { TextContentPipe } from '@shared/pipes/text-content.pipe';
import {
  EMessageStatus,
  IMessageEntity,
  TextRoomStore,
} from '../text-room.store';
import { MessageVisibilityDirective } from '@shared/directives/message-visibility.directive';
import { TextRoomApiService } from '../text-room-api.service';
import { TuiList } from '@taiga-ui/layout';
import { PolymorpheusContent } from '@taiga-ui/polymorpheus';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { MessageAttachmentsComponent } from '../message-attachments/message-attachments.component';

@Component({
  selector: 'app-text-room-message',
  imports: [
    DayjsPipe,
    TranslatePipe,
    UserAvatarComponent,
    TuiButton,
    TuiDataList,
    TuiDropdown,
    TuiEditorSocket,
    TuiHint,
    TuiIcon,
    TuiLoader,
    TuiOption,
    TuiAutoColorPipe,
    TextContentPipe,
    MessageVisibilityDirective,
    MessageAttachmentsComponent,
    TuiList,
  ],
  templateUrl: './text-room-message.component.html',
  styleUrl: './text-room-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomMessageComponent {
  private readonly store = inject(Store);
  private readonly textRoomStore = inject(TextRoomStore);
  private readonly usersStore = inject(UsersStore);
  private readonly sanitizer = inject(Sanitizer);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationService = inject(TuiNotificationService);
  private readonly tuiDialogService = inject(TuiDialogService);
  private readonly textRoomApiService = inject(TextRoomApiService);
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly message = input.required<IMessageEntity>();

  protected readonly usersById = computed(() => this.usersStore.entityMap());

  protected readonly sanitizedContent = computed(() =>
    this.sanitizer.sanitize(SecurityContext.HTML, this.message().content),
  );

  protected readonly attachmentList = computed(
    () => this.message().attachments ?? [],
  );

  protected readonly hasText = computed(() => {
    const content = this.sanitizedContent();
    return !!content && content.replace(/<[^>]*>/g, '').trim().length > 0;
  });

  protected readonly senderUser = computed(() => {
    const message = this.message();
    const fromStore = this.usersStore.entityMap()[message.senderId];
    const currentUser = this.currentUser();
    if (fromStore) {
      return fromStore;
    }
    if (currentUser && message.senderId === currentUser.id) {
      return currentUser;
    }
    return null;
  });

  protected readonly senderUsername = computed(() => {
    const senderUser = this.senderUser();
    const message = this.message();
    return senderUser?.username ?? message.senderUsername;
  });

  protected readonly senderFullnameHint = computed(() => {
    const username = this.senderUsername();
    const fullname = this.senderUser()?.fullname;
    return fullname && fullname !== username ? fullname : null;
  });

  protected readonly avatarUrl = computed(() => {
    const message = this.message();
    const fromStore = this.usersStore.entityMap()[message.senderId]?.avatarUrl;
    const currentUser = this.currentUser();
    if (fromStore) {
      return fromStore;
    }
    if (currentUser && message.senderId === currentUser.id) {
      return currentUser.avatarUrl ?? null;
    }
    return null;
  });

  protected readonly isOwnMessage = computed(() => {
    const currentUser = this.currentUser() as IUser | null;
    const message = this.message();
    return !!currentUser && message.senderId === currentUser.id;
  });

  protected readonly isDirectChat = computed(() => {
    return this.message().recipientId !== null;
  });

  protected readonly shouldShowAvatar = computed(() => {
    // In private chats, don't show avatar for anyone
    if (this.isDirectChat()) {
      return false;
    }
    // For group chats, show avatar only for other's messages
    return !this.isOwnMessage();
  });

  /**
   * 'loading' — own message, create/update/delete in flight
   * 'error'   — own pending create failed
   * 'sent'    — own message, not yet read by anyone
   * 'read'    — own message, read by at least one other user
   * null      — someone else's message (no status shown)
   */
  protected readonly readStatus = computed<
    'loading' | 'error' | 'sent' | 'read' | null
  >(() => {
    if (!this.isOwnMessage()) return null;
    const message = this.message();
    if (message.status === EMessageStatus.LOADING) return 'loading';
    if (message.status === EMessageStatus.ERROR && message.isPendingCreate) {
      return 'error';
    }
    return message.isRead ? 'read' : 'sent';
  });

  protected readonly canResend = computed(() => this.readStatus() === 'error');

  protected readonly canEdit = computed(() => this.isOwnMessage());
  protected readonly canViewReaders = computed(() => {
    const isOwnMessage = this.isOwnMessage();
    const isDirectChat = this.isDirectChat();
    return isOwnMessage && !isDirectChat;
  });
  protected readonly canDelete = computed(() => {
    const currentUser = this.currentUser();
    const message = this.message();
    return canDeleteTextRoomMessage(message, currentUser);
  });

  protected readonly readers = signal<IUser[]>([]);
  protected readonly readersLoading = signal(false);

  protected replyMessage(): void {
    this.textRoomStore.setReplyToMessageId(this.message().id);
  }

  protected editMessage(): void {
    this.textRoomStore.setEditableMessageId(this.message().id);
  }

  protected deleteMessage(): void {
    this.textRoomStore.deleteMessage(this.message().id);
  }

  protected resendMessage(): void {
    this.textRoomStore.retryMessage(this.message().id);
  }

  protected onReplyQuoteClick(reply: ITextRoomMessageReply): void {
    if (reply.isDeleted) {
      this.tuiNotificationService
        .open(this.translateService.instant('ROOMS.ORIGINAL_MESSAGE_DELETED'), {
          appearance: 'info',
          autoClose: 3000,
        })
        .subscribe();
      return;
    }
    this.textRoomStore.jumpToMessage(reply.id);
  }

  protected showReadersDialog(template: PolymorpheusContent): void {
    this.readers.set([]);
    this.readersLoading.set(true);

    this.textRoomApiService.getReaders(this.message().id).subscribe({
      next: (users) => {
        this.readers.set(users);
        this.readersLoading.set(false);
      },
      error: () => {
        this.readersLoading.set(false);
      },
    });

    this.tuiDialogService
      .open(template, {
        label: this.translateService.instant('ROOMS.READ_BY'),
        closable: true,
        size: 's',
      })
      .subscribe();
  }
}
