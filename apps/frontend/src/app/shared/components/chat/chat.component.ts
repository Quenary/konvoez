import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgOptimizedImage } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import {
  TuiButton,
  TuiHint,
  TuiIcon,
  TuiInput,
  TuiTextfield,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiHeader } from '@taiga-ui/layout';
import { TuiAutoFocus } from '@taiga-ui/cdk';
import {
  tuiAutoColor,
  TuiAvatar,
  TuiBadgedContent,
  TuiBadgeNotification,
  TuiFade,
  TuiInitialsPipe,
} from '@taiga-ui/kit';
import { FileDropDirective } from '@shared/directives/file-drop.directive';
import { ChatEditorComponent } from './chat-editor/chat-editor.component';
import { ChatMessagesListComponent } from './chat-messages-list/chat-messages-list.component';
import { ChatStore } from './chat.store';
import {
  ChatTarget,
  chatTargetToApiIds,
  chatTargetsEqual,
} from './chat-target';
import type { IChatEditorSubmission } from './chat-editor/chat-editor.component';
import { toChatKey } from './composer-drafts';
import { ComposerFocusService } from './composer-focus.service';
import { v4 } from 'uuid';

import { HeaderBackButtonComponent } from '@shared/components/header-back-button/header-back-button.component';
import { icons } from '@constants';

@Component({
  selector: 'app-chat',
  imports: [
    HeaderBackButtonComponent,
    ChatEditorComponent,
    ChatMessagesListComponent,
    TuiTitle,
    TuiHeader,
    TuiButton,
    TuiHint,
    TuiIcon,
    TuiTextfield,
    TuiInput,
    TuiAutoFocus,
    TuiAvatar,
    TuiBadgedContent,
    TuiBadgeNotification,
    TuiFade,
    TuiInitialsPipe,
    NgOptimizedImage,
    ReactiveFormsModule,
    TranslatePipe,
    FileDropDirective,
  ],
  providers: [ChatStore, ComposerFocusService],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent {
  protected readonly chatStore = inject(ChatStore);

  protected readonly icons = icons;
  public readonly roomId = input<number | null>(null);
  public readonly recipientId = input<number | null>(null);

  protected readonly backRoute = computed(() =>
    this.roomId() !== null ? '/text-room' : '/direct',
  );
  public readonly title = input.required<string>();
  public readonly initialsSource = input<string | null>(null);
  public readonly avatarUrl = input<string | null>(null);
  public readonly avatarIcon = input<string | null>(null);
  public readonly isOnline = input<boolean>(false);
  public readonly initialMessageId = input<string | null>(null);
  public readonly headerClick = output<void>();
  /** Fired after a non-empty `initialMessageId` is joined or jumped to. */
  public readonly initialMessageApplied = output<void>();
  /** Direct chats color the nickname (except saved messages). */
  protected readonly identityColor = computed(() => {
    const title = this.title();
    const recipientId = this.recipientId();
    const avatarIcon = this.avatarIcon();
    return recipientId != null && !avatarIcon ? tuiAutoColor(title) : null;
  });
  protected readonly draftKey = computed(() =>
    toChatKey(this.roomId(), this.recipientId()),
  );

  protected readonly searchControl = new FormControl<string>('', {
    nonNullable: true,
  });

  private readonly editor = viewChild(ChatEditorComponent);
  private lastHandledInitialMessageId: string | null = null;

  constructor() {
    effect(() => {
      const roomId = this.roomId();
      const recipientId = this.recipientId();
      const nextTarget = resolveChatTarget(roomId, recipientId);
      const initialId = this.initialMessageId();

      // join()/leave()/patchState read store signals; keep them untracked or
      // the effect re-runs on every store update and freezes the tab.
      untracked(() => {
        const current = this.chatStore.target();
        if (chatTargetsEqual(current, nextTarget)) {
          if (!initialId) {
            this.lastHandledInitialMessageId = null;
            return;
          }
          if (initialId !== this.lastHandledInitialMessageId) {
            this.lastHandledInitialMessageId = initialId;
            this.chatStore.jumpToMessage(initialId);
            this.initialMessageApplied.emit();
          }
          return;
        }
        if (current !== null) {
          this.chatStore.leave();
        }
        if (nextTarget !== null) {
          this.lastHandledInitialMessageId = initialId;
          if (initialId) {
            this.chatStore.join(nextTarget, initialId);
            this.initialMessageApplied.emit();
          } else {
            this.chatStore.join(nextTarget);
          }
        }
        this.searchControl.setValue('', { emitEvent: false });
      });
    });

    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((query) => {
        this.chatStore.setSearchQuery(query);
      });
  }

  protected onFilesDropped(files: File[]): void {
    this.editor()?.addFiles(files);
  }

  protected onMessageSubmitted({
    content,
    files,
    replyToMessage,
  }: IChatEditorSubmission): void {
    const { roomId, recipientId } = chatTargetToApiIds(this.chatStore.target());
    this.chatStore.createMessage({
      tempId: v4(),
      data: {
        content,
        roomId,
        recipientId,
        replyToId: replyToMessage?.id ?? null,
        attachmentIds: [],
      },
      files,
    });
  }

  protected onMessageEdited({
    messageId,
    content,
  }: {
    messageId: string;
    content: string;
  }): void {
    this.chatStore.updateMessage({
      messageId,
      data: { content },
    });
  }

  protected onReplyCancelled(): void {
    this.chatStore.setReplyToMessageId(null);
  }

  protected onEditCancelled(): void {
    this.chatStore.setEditableMessageId(null);
  }

  protected toggleSearch(): void {
    this.onSearchOpenChange(!this.chatStore.isSearchOpen());
  }

  protected onSearchOpenChange(open: boolean): void {
    this.chatStore.setSearchOpen(open);
    if (!open && this.searchControl.value) {
      this.clearSearch();
    }
  }

  protected clearSearch(): void {
    this.searchControl.setValue('');
    this.chatStore.clearSearch();
  }
}

function resolveChatTarget(
  roomId: number | null,
  recipientId: number | null,
): ChatTarget | null {
  if (roomId != null) {
    return { kind: 'room', id: roomId };
  }
  if (recipientId != null) {
    return { kind: 'direct', id: recipientId };
  }
  return null;
}
