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
import { NgOptimizedImage } from '@angular/common';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TuiDataList,
  TuiDialogService,
  TuiDropdown,
  TuiIcon,
  TuiNotificationService,
  TuiOption,
} from '@taiga-ui/core';
import { TuiEditorSocket } from '@taiga-ui/editor';
import { TuiAutoColorPipe, TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';
import { EUserRole, ITextRoomMessageReply, IUser } from '@konvoez/shared';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { DayjsPipe } from '@shared/pipes/dayjs.pipe';
import { UsersStore } from '@features/users/users.store';
import { TextContentPipe } from '@shared/pipes/text-content.pipe';
import { IMessageEntity, TextRoomStore } from '../text-room.store';
import { MessageVisibilityDirective } from '@shared/directives/message-visibility.directive';
import { TextRoomApiService } from '../text-room-api.service';
import { TuiList } from '@taiga-ui/layout';
import { PolymorpheusContent } from '@taiga-ui/polymorpheus';

@Component({
  selector: 'app-text-room-message',
  imports: [
    DayjsPipe,
    NgOptimizedImage,
    TranslatePipe,
    TuiAvatar,
    TuiDataList,
    TuiDropdown,
    TuiEditorSocket,
    TuiIcon,
    TuiInitialsPipe,
    TuiOption,
    TuiAutoColorPipe,
    TextContentPipe,
    MessageVisibilityDirective,
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

  public readonly message = input.required<IMessageEntity>();

  protected readonly sanitizedContent = computed(() =>
    this.sanitizer.sanitize(SecurityContext.HTML, this.message().content),
  );

  protected readonly avatarUrl = computed(() => {
    const message = this.message();
    const fromStore = this.usersStore.entityMap()[message.senderId]?.avatarUrl;
    if (fromStore) {
      return fromStore;
    }
    const currentUser = this.currentUser();
    if (currentUser && message.senderId === currentUser.id) {
      return currentUser.avatarUrl ?? null;
    }
    return null;
  });

  protected readonly isOwnMessage = computed(() => {
    const currentUser = this.currentUser() as IUser | null;
    return !!currentUser && this.message().senderId === currentUser.id;
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
   * 'sent'  — own message, not yet read by anyone
   * 'read'  — own message, read by at least one other user
   * null    — someone else's message (no status shown)
   */
  protected readonly readStatus = computed<'sent' | 'read' | null>(() => {
    if (!this.isOwnMessage()) return null;
    return this.message().isRead ? 'read' : 'sent';
  });

  protected readonly canEdit = computed(() => this.isOwnMessage());
  protected readonly canViewReaders = computed(() => {
    const isOwnMessage = this.isOwnMessage();
    const isDirectChat = this.isDirectChat();
    return isOwnMessage && !isDirectChat;
  });
  protected readonly canDelete = computed(() => {
    const currentUser = this.currentUser() as IUser | null;
    const message = this.message();

    if (!currentUser) return false;
    if (message.senderId === currentUser.id) return true;
    return [EUserRole.OWNER, EUserRole.ADMIN].includes(currentUser.role);
  });

  protected readonly readers = signal<IUser[]>([]);
  protected readonly readersLoading = signal(false);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected replyMessage(): void {
    this.textRoomStore.setReplyToMessageId(this.message().id);
  }

  protected editMessage(): void {
    this.textRoomStore.setEditableMessageId(this.message().id);
  }

  protected deleteMessage(): void {
    this.textRoomStore.deleteMessage(this.message().id);
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
