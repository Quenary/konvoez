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
import { UsersStore } from '@features/users/users.store';
import { TextContentPipe } from '@shared/pipes/text-content.pipe';
import { EMessageStatus, IMessageEntity, ChatStore } from '../chat.store';
import { MessageVisibilityDirective } from '@shared/directives/message-visibility.directive';
import { TextRoomApiService } from '@core/chat/text-room-api.service';
import { TuiList } from '@taiga-ui/layout';
import { PolymorpheusContent } from '@taiga-ui/polymorpheus';
import { mediaFrameLimit } from '@shared/components/media-grid/media-grid.layout';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { ChatMessageAttachmentsComponent } from '../chat-message-attachments/chat-message-attachments.component';
import { OutgoingMessagesStore } from '@core/chat/outgoing/outgoing-messages.store';
import { EAttachmentKind } from '@konvoez/shared';
import { TodayDayjsPipe } from '@shared/pipes/today-dayjs.pipe';

@Component({
  selector: 'app-chat-message',
  imports: [
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
    ChatMessageAttachmentsComponent,
    TuiList,
    TodayDayjsPipe,
  ],
  templateUrl: './chat-message.component.html',
  styleUrl: './chat-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageComponent {
  private readonly store = inject(Store);
  private readonly chatStore = inject(ChatStore);
  private readonly usersStore = inject(UsersStore);
  private readonly sanitizer = inject(Sanitizer);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationService = inject(TuiNotificationService);
  private readonly tuiDialogService = inject(TuiDialogService);
  private readonly textRoomApiService = inject(TextRoomApiService);
  private readonly outgoingStore = inject(OutgoingMessagesStore);

  public readonly message = input.required<IMessageEntity>();

  private readonly emptyProgress: Record<string, number> = {};

  protected readonly usersById = computed(() => this.usersStore.entityMap());

  protected readonly sanitizedContent = computed(() =>
    this.sanitizer.sanitize(SecurityContext.HTML, this.message().content),
  );

  protected readonly attachmentList = computed(
    () => this.message().attachments ?? [],
  );

  protected readonly outgoing = computed(() => this.message().outgoing ?? null);

  protected readonly progress = computed(() =>
    this.outgoing() ? this.outgoingStore.uploadProgress() : this.emptyProgress,
  );

  protected readonly mediaFrame = computed(() => {
    const outgoing = this.outgoing();
    const attachments = this.attachmentList();
    const sizes: { width: number; height: number }[] = [];
    if (outgoing) {
      for (const file of outgoing.files) {
        if (
          file.kind !== EAttachmentKind.IMAGE &&
          file.kind !== EAttachmentKind.VIDEO
        ) {
          continue;
        }
        if (!file.width || !file.height) {
          return null;
        }
        sizes.push({ width: file.width, height: file.height });
      }
    } else {
      for (const item of attachments) {
        if (
          item.kind !== EAttachmentKind.IMAGE &&
          item.kind !== EAttachmentKind.VIDEO
        ) {
          continue;
        }
        if (!item.width || !item.height) {
          return null;
        }
        sizes.push({ width: item.width, height: item.height });
      }
    }
    return mediaFrameLimit(sizes);
  });

  protected readonly hasMedia = computed(() => {
    const outgoing = this.outgoing();
    const attachments = this.attachmentList();
    if (outgoing) {
      return outgoing.files.some(
        (file) =>
          file.kind === EAttachmentKind.IMAGE ||
          file.kind === EAttachmentKind.VIDEO,
      );
    }
    return attachments.some(
      (item) =>
        item.kind === EAttachmentKind.IMAGE ||
        item.kind === EAttachmentKind.VIDEO,
    );
  });

  protected readonly showAttachments = computed(() => {
    const outgoing = this.outgoing();
    const attachments = this.attachmentList();
    return (outgoing?.files.length ?? 0) > 0 || attachments.length > 0;
  });

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

  protected readonly canCancelSending = computed(() => {
    const phase = this.outgoing()?.state.phase;
    return phase === 'uploading' || phase === 'failed';
  });

  protected readonly canEdit = computed(
    () => this.isOwnMessage() && !this.outgoing(),
  );
  protected readonly canViewReaders = computed(() => {
    const isOwnMessage = this.isOwnMessage();
    const isDirectChat = this.isDirectChat();
    const outgoing = this.outgoing();
    return isOwnMessage && !isDirectChat && !outgoing;
  });
  protected readonly canDelete = computed(() => {
    const currentUser = this.currentUser();
    const message = this.message();
    const outgoing = this.outgoing();
    return !outgoing && canDeleteTextRoomMessage(message, currentUser);
  });

  protected readonly readers = signal<IUser[]>([]);
  protected readonly readersLoading = signal(false);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected replyMessage(): void {
    this.chatStore.setReplyToMessageId(this.message().id);
  }

  protected editMessage(): void {
    this.chatStore.setEditableMessageId(this.message().id);
  }

  protected deleteMessage(): void {
    this.chatStore.deleteMessage(this.message().id);
  }

  protected resendMessage(): void {
    this.chatStore.retryMessage(this.message().id);
  }

  protected cancelSending(): void {
    this.chatStore.cancelOutgoing(this.message().id);
  }

  protected removeOutgoingFile(localId: string): void {
    this.chatStore.removeOutgoingFile(this.message().id, localId);
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
    this.chatStore.jumpToMessage(reply.id);
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
