import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  signal,
  Sanitizer,
  SecurityContext,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import {
  TuiButton,
  TuiDropdown,
  TuiHint,
  TuiIcon,
  TuiLoader,
  TuiNotificationService,
} from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { TuiEditorSocket } from '@taiga-ui/editor';
import { TuiAutoColorPipe } from '@taiga-ui/kit';
import {
  canDeleteTextRoomMessage,
  IMentionSet,
  ITextRoomMessageReply,
  IUserSafe,
} from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { RolesStore } from '@core/stores/roles.store';
import { UsersStore } from '@core/stores/users.store';
import { TextContentPipe } from '@shared/pipes/text-content.pipe';
import { EMessageStatus, IMessageEntity, ChatStore } from '../chat.store';
import { ComposerFocusService } from '../composer-focus.service';
import { ChatApiService } from '@core/api/chat-api.service';
import { LayoutService } from '@core/services/layout.service';
import { TuiList } from '@taiga-ui/layout';
import { PolymorpheusContent } from '@taiga-ui/polymorpheus';
import {
  messageHasMedia,
  messageMediaFrame,
} from '@shared/functions/message-media-frame.function';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { ChatMessageAttachmentsComponent } from '../chat-message-attachments/chat-message-attachments.component';
import { ChatMessageMenuComponent } from './chat-message-menu/chat-message-menu.component';
import { ChatMessageReactionsComponent } from './chat-message-reactions/chat-message-reactions.component';
import { OutgoingMessagesStore } from '@core/chat/outgoing/outgoing-messages.store';
import { TodayDayjsPipe } from '@shared/pipes/today-dayjs.pipe';
import { ExternalLinkClickDirective } from '@shared/directives/external-link-click.directive';
import { WithUserDialogDirective } from '@shared/user-dialog/with-user-dialog.directive';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';
import { MentionChipsDirective } from '@shared/components/mention-chip/mention-chips.directive';
import { IMentionChipContext } from '@shared/components/mention-chip/mention-chip.vm';
import {
  REPLY_GESTURE_IGNORE_SELECTOR,
  SwipeToReplyDirective,
  USER_MENTION_SELECTOR,
} from '@shared/directives/swipe-to-reply.directive';
import { insertMentionPlaceholders } from './render-mentions';

const EMPTY_MENTIONS: IMentionSet = {
  userIds: [],
  roleIds: [],
  everyone: false,
};

import { icons } from '@constants';

@Component({
  selector: 'app-chat-message',
  imports: [
    TranslatePipe,
    UserAvatarComponent,
    TuiButton,
    TuiDropdown,
    TuiEditorSocket,
    TuiHint,
    TuiIcon,
    TuiLoader,
    TuiAutoColorPipe,
    TextContentPipe,
    ChatMessageAttachmentsComponent,
    ChatMessageMenuComponent,
    ChatMessageReactionsComponent,
    TuiList,
    TodayDayjsPipe,
    ExternalLinkClickDirective,
    WithUserDialogDirective,
    MentionChipsDirective,
    SwipeToReplyDirective,
  ],
  host: {
    '(click)': 'onHostClick($event)',
    '[attr.data-message-id]': 'message().id',
  },
  templateUrl: './chat-message.component.html',
  styleUrl: './chat-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageComponent implements OnDestroy {
  protected readonly layoutService = inject(LayoutService);
  protected readonly rolesStore = inject(RolesStore);
  private readonly composerFocus = inject(ComposerFocusService);
  private readonly store = inject(Store);
  private readonly chatStore = inject(ChatStore);
  private readonly usersStore = inject(UsersStore);
  private readonly sanitizer = inject(Sanitizer);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationService = inject(TuiNotificationService);
  private readonly tuiResponsiveDialogService = inject(
    TuiResponsiveDialogService,
  );
  private readonly chatApiService = inject(ChatApiService);
  private readonly outgoingStore = inject(OutgoingMessagesStore);
  private readonly userDialogService = inject(UserDialogService);
  private readonly document = inject(DOCUMENT);

  public readonly message = input.required<IMessageEntity>();
  protected readonly icons = icons;
  protected readonly menuTemplateRef =
    viewChild<TemplateRef<unknown>>('menuTemplate');

  protected readonly usersById = computed(() => this.usersStore.entityMap());

  protected readonly isRoomMessage = computed(
    () => this.message().roomId != null,
  );

  protected readonly sanitizedContent = computed(() =>
    this.sanitizer.sanitize(SecurityContext.HTML, this.message().content),
  );

  protected readonly contentHtml = computed(() => {
    const isRoom = this.isRoomMessage();
    const sanitized = this.sanitizedContent();
    return isRoom ? insertMentionPlaceholders(sanitized ?? '') : sanitized;
  });

  protected readonly mentionCtx = computed<IMentionChipContext>(() => {
    const usersById = this.usersById();
    const rolesById = this.rolesStore.rolesById();
    const me = this.currentUser();
    const unknownLabel = this.unknownLabel();
    const isOwn = this.isOwnMessage();
    const mentions = this.message().mentions;
    const accepted = isOwn ? EMPTY_MENTIONS : mentions;
    return {
      usersById,
      rolesById,
      me,
      unknownLabel,
      accepted,
    };
  });

  protected readonly attachmentList = computed(
    () => this.message().attachments ?? [],
  );

  protected readonly outgoing = computed(() => this.message().outgoing ?? null);

  protected readonly progress = computed(() =>
    this.outgoing() ? this.outgoingStore.uploadProgress() : this.emptyProgress,
  );

  protected readonly mediaFrame = computed(() =>
    messageMediaFrame(this.message()),
  );

  protected readonly hasMedia = computed(() => messageHasMedia(this.message()));

  protected readonly showAttachments = computed(() => {
    const outgoing = this.outgoing();
    const attachments = this.attachmentList();
    return (outgoing?.files.length ?? 0) > 0 || attachments.length > 0;
  });

  protected readonly hasText = computed(() => {
    const content = this.sanitizedContent();
    if (!content) {
      return false;
    }
    return (
      content.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/gi, '').trim()
        .length > 0
    );
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
    const currentUser = this.currentUser() as IUserSafe | null;
    const message = this.message();
    return !!currentUser && message.senderId === currentUser.id;
  });

  protected readonly isDirectChat = computed(() => {
    return this.message().recipientId !== null;
  });

  protected readonly shouldShowAvatar = computed(() => {
    if (this.isDirectChat()) {
      return false;
    }
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

  protected readonly readers = signal<IUserSafe[]>([]);
  protected readonly readersLoading = signal(false);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  protected readonly unknownLabel = toSignal(
    this.translateService.stream('CHAT.MENTION_UNKNOWN'),
    { initialValue: 'unknown' },
  );
  private readonly emptyProgress: Record<string, number> = {};
  private menuDialogSub: Subscription | null = null;
  private menuModal: HTMLElement | null = null;
  private stopWatchingModal: (() => void) | null = null;

  protected readonly currentUserId = computed(
    () => this.currentUser()?.id ?? null,
  );

  public ngOnDestroy(): void {
    this.menuDialogSub?.unsubscribe();
    this.menuDialogSub = null;
    this.menuModal = null;
    this.stopWatchingModal?.();
    this.stopWatchingModal = null;
  }

  protected onLongTap(event: Event): void {
    if (!this.layoutService.isNarrow()) {
      return;
    }
    event.preventDefault();
    this.openMobileDialog();
  }

  protected onHostClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const chip = target.closest<HTMLElement>(USER_MENTION_SELECTOR);
    if (chip) {
      this.openMentionUser(chip);
      return;
    }

    if (event.detail !== 2 || this.outgoing() || isTouchClick(event)) {
      return;
    }
    if (target.closest(REPLY_GESTURE_IGNORE_SELECTOR)) {
      return;
    }
    this.replyMessage();
  }

  protected onReactionSelect(emoji: string): void {
    if (this.outgoing()) {
      return;
    }
    this.chatStore.toggleReaction({ messageId: this.message().id, emoji });
  }

  protected closeSurface(close?: unknown): void {
    this.closeDropdown(close);
    this.dismissMenuDialog();
  }

  protected replyMessage(close?: unknown): void {
    this.closeDropdown(close);
    this.chatStore.setReplyToMessageId(this.message().id);
    this.focusComposerAfterMenu();
  }

  protected editMessage(close?: unknown): void {
    this.closeDropdown(close);
    this.chatStore.setEditableMessageId(this.message().id);
    this.focusComposerAfterMenu();
  }

  protected deleteMessage(close?: unknown): void {
    this.closeDropdown(close);
    this.dismissMenuDialog();
    this.chatStore.deleteMessage(this.message().id);
  }

  protected resendMessage(): void {
    this.chatStore.retryMessage(this.message().id);
  }

  protected cancelSending(close?: unknown): void {
    this.closeDropdown(close);
    this.dismissMenuDialog();
    this.chatStore.cancelOutgoing(this.message().id);
  }

  protected onViewReaders(close: unknown, template: PolymorpheusContent): void {
    this.closeDropdown(close);
    if (!this.menuDialogSub) {
      this.showReadersDialog(template);
      return;
    }
    void this.afterMenuDialog().then(() => this.showReadersDialog(template));
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

    this.chatApiService.getReaders(this.message().id).subscribe({
      next: (users) => {
        this.readers.set(users);
        this.readersLoading.set(false);
      },
      error: () => {
        this.readersLoading.set(false);
      },
    });

    this.tuiResponsiveDialogService
      .open(template, {
        label: this.translateService.instant('ROOMS.READ_BY'),
        closable: true,
        size: 's',
      })
      .subscribe();
  }

  private openMobileDialog(): void {
    if (this.menuDialogSub) {
      return;
    }
    const template = this.menuTemplateRef();
    if (!template) {
      return;
    }
    this.menuDialogSub = this.tuiResponsiveDialogService
      .open(template, {
        size: 's',
      })
      .subscribe({
        complete: () => {
          this.menuDialogSub = null;
          this.menuModal = null;
        },
        error: () => {
          this.menuDialogSub = null;
          this.menuModal = null;
        },
      });
    const modals = this.document.querySelectorAll('tui-popups tui-modal');
    const modal = modals.item(modals.length - 1);
    this.menuModal = modal instanceof HTMLElement ? modal : null;
  }

  private closeDropdown(close: unknown): void {
    if (typeof close === 'function') {
      close();
    }
  }

  private dismissMenuDialog(): void {
    if (!this.menuDialogSub) {
      return;
    }
    void this.afterMenuDialog();
  }

  private focusComposerAfterMenu(): void {
    if (!this.menuDialogSub) {
      this.composerFocus.focus();
      return;
    }
    void this.afterMenuDialog().then(() => this.composerFocus.focus());
  }

  /**
   * Resolves once Taiga has removed this modal. Until then the app root stays
   * `inert` and the focus trap takes focus back, so the composer cannot be
   * focused on a timer.
   */
  private afterMenuDialog(): Promise<void> {
    const sub = this.menuDialogSub;
    const modal = this.menuModal;
    this.menuDialogSub = null;
    this.menuModal = null;
    const removed = this.whenModalRemoved(modal);
    sub?.unsubscribe();
    this.finishMenuModalAnimations(modal);
    // Taiga samples the inner dialog animation in a later microtask.
    queueMicrotask(() => this.finishMenuModalAnimations(modal));
    return removed.then(() => undefined);
  }

  private whenModalRemoved(modal: HTMLElement | null): Promise<void> {
    this.stopWatchingModal?.();
    this.stopWatchingModal = null;
    if (!modal?.isConnected) {
      return Promise.resolve();
    }
    const parent = modal.parentNode;
    if (!parent) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (modal.isConnected) {
          return;
        }
        this.stopWatchingModal?.();
        this.stopWatchingModal = null;
        resolve();
      });
      observer.observe(parent, { childList: true });
      this.stopWatchingModal = () => observer.disconnect();
    });
  }

  private finishMenuModalAnimations(modal: HTMLElement | null): void {
    modal?.getAnimations?.({ subtree: true }).forEach((animation) => {
      try {
        animation.finish();
      } catch {
        // Already finished or not finishable.
      }
    });
  }

  private openMentionUser(chip: HTMLElement): void {
    const rawId = chip.getAttribute('data-id');
    if (!rawId) {
      return;
    }
    const id = parseInt(rawId, 10);
    if (!Number.isFinite(id)) {
      return;
    }
    const user = this.usersById()[id];
    if (user) {
      this.userDialogService.open(user);
    }
  }
}

function isTouchClick(event: MouseEvent): boolean {
  return (
    'pointerType' in event && (event as PointerEvent).pointerType === 'touch'
  );
}
