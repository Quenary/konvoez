import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  Sanitizer,
  SecurityContext,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TuiDataList,
  TuiDropdown,
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
    TuiInitialsPipe,
    TuiOption,
    TuiAutoColorPipe,
    TextContentPipe,
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

  public readonly message = input.required<IMessageEntity>();

  protected readonly sanitizedContent = computed(() =>
    this.sanitizer.sanitize(SecurityContext.HTML, this.message().content),
  );

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

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

  protected readonly canEdit = computed(() => {
    const me = this.currentUser() as IUser | null;
    return !!me && this.message().senderId === me.id;
  });

  protected readonly canDelete = computed(() => {
    const me = this.currentUser() as IUser | null;
    if (!me) {
      return false;
    }
    if (this.message().senderId === me.id) {
      return true;
    }
    return [EUserRole.OWNER, EUserRole.ADMIN].includes(me.role);
  });

  protected readonly isOwnMessage = computed(() => {
    const me = this.currentUser() as IUser | null;
    return !!me && this.message().senderId === me.id;
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
}
