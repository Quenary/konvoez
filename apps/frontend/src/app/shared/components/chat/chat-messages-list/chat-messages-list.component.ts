import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiHint, TuiScrollbar } from '@taiga-ui/core';
import {
  TuiBadgedContent,
  TuiBadgeNotification,
  TuiSkeleton,
} from '@taiga-ui/kit';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { MessageReadQueueService } from '@core/chat/message-read-queue.service';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { IsVisibleDirective } from '@shared/directives/is-visible.directive';
import { ChatMessageComponent } from '../chat-message/chat-message.component';
import { ChatSystemItemComponent } from '../chat-system-item/chat-system-item.component';
import { ChatStore, IMessageEntity } from '../chat.store';
import { ChatTarget } from '../chat-target';
import {
  buildChatRows,
  ChatRow,
  estimateChatRowSize,
  isReadTrackable,
} from './chat-rows';
import { CHAT_VIRTUALIZER_FACTORY } from './chat-virtualizer';
import { VirtualMeasureDirective } from './virtual-measure.directive';

/** Distance from an edge, in viewport heights, at which the next page loads. */
export const PREFETCH_VIEWPORTS = 2.5;
/** Distance from the end above which the scroll-to-bottom button shows. */
const SCROLL_BUTTON_DISTANCE_PX = 200;
/** Pinned-to-end slack for following appended messages. */
const SCROLL_END_THRESHOLD_PX = 80;
const ROW_GAP_PX = 8;
const LIST_PADDING_PX = 8;
const OVERSCAN_ROWS = 8;
const SCROLLING_RESET_DELAY_MS = 150;
/** Ends a programmatic jump that produced no scrolling (already in place). */
const JUMP_FALLBACK_MS = 400;
const DEFAULT_LIST_WIDTH_PX = 600;
const FRAME_MS = 16;
/** Unchanged frames after which a jump counts as landed. */
const JUMP_STABLE_FRAMES = 4;
const JUMP_MAX_SETTLE_FRAMES = 60;

@Component({
  selector: 'app-chat-messages-list',
  imports: [
    ChatMessageComponent,
    ChatSystemItemComponent,
    IsVisibleDirective,
    VirtualMeasureDirective,
    TuiScrollbar,
    TuiSkeleton,
    TuiButton,
    TuiBadgedContent,
    TuiBadgeNotification,
    TranslatePipe,
    TuiHint,
  ],
  templateUrl: './chat-messages-list.component.html',
  styleUrl: './chat-messages-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessagesListComponent {
  private readonly chatStore = inject(ChatStore);
  private readonly unreadCountsStore = inject(UnreadCountsStore);
  private readonly readQueue = inject(MessageReadQueueService);
  private readonly injector = inject(Injector);
  private readonly currentUser = inject(Store).selectSignal(selectCurrentUser);

  private readonly scrollContainerRef = viewChild.required<
    unknown,
    ElementRef<HTMLElement>
  >('scrollContainer', {
    read: ElementRef,
  });

  protected readonly rows = computed(() =>
    buildChatRows({
      messages: this.chatStore.messages(),
      unreadDividerMessageId: this.chatStore.unreadDividerMessageId(),
      loadingOlder: this.chatStore.loadingOlder(),
      loadingNewer: this.chatStore.loadingNewer(),
    }),
  );

  protected readonly virtualizer = inject(CHAT_VIRTUALIZER_FACTORY)(() => {
    const rows = this.rows();
    return {
      scrollElement: this.scrollContainerRef(),
      count: rows.length,
      getItemKey: (index: number) => rows[index]?.key ?? index,
      estimateSize: (index: number) => this.estimateSize(rows[index]),
      anchorTo: 'end',
      followOnAppend: true,
      scrollEndThreshold: SCROLL_END_THRESHOLD_PX,
      overscan: OVERSCAN_ROWS,
      gap: ROW_GAP_PX,
      paddingStart: LIST_PADDING_PX,
      paddingEnd: LIST_PADDING_PX,
      isScrollingResetDelay: SCROLLING_RESET_DELAY_MS,
    };
  });

  protected readonly virtualItems = this.virtualizer.getVirtualItems;
  protected readonly totalSize = this.virtualizer.getTotalSize;
  /** The Taiga content wrapper has no height, so the viewport is sized here. */
  protected readonly viewportHeight = computed(
    () => this.virtualizer.scrollRect()?.height ?? 0,
  );
  protected readonly measureElement = (element: HTMLElement | null): void =>
    this.virtualizer.measureElement(element);

  protected readonly hasMoreAfter = this.chatStore.hasMoreAfter;
  protected readonly unreadCount = computed(() =>
    this.unreadCountsStore.chatUnreadCount(this.activeTarget()),
  );
  private readonly farFromEnd = computed(() => {
    this.virtualizer.scrollOffset();
    this.virtualizer.getTotalSize();
    return !this.virtualizer.isAtEnd(SCROLL_BUTTON_DISTANCE_PX);
  });
  protected readonly shouldShowScrollButton = computed(
    () => this.farFromEnd() || this.hasMoreAfter(),
  );
  private readonly activeTarget = computed((): ChatTarget | null =>
    this.chatStore.target(),
  );
  private readonly messagesById = computed(
    () =>
      new Map(
        this.chatStore.messages().map((message) => [message.id, message]),
      ),
  );

  /** Programmatic scroll in flight: blocks edge loading and read receipts. */
  private readonly jumping = signal(false);
  /** Initial position for the current chat not applied yet. */
  private readonly positioned = signal(false);
  private readonly readBlocked = computed(
    () => this.jumping() || this.virtualizer.isScrolling(),
  );
  private readonly visibleIds = new Set<string>();

  private jumpSawScrolling = false;
  private jumpFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingHighlightId: string | null = null;
  private lastOutgoingId: string | null = null;
  private listWidth = DEFAULT_LIST_WIDTH_PX;
  private readonly scrollToLatestTokenAtInit =
    this.chatStore.scrollToLatestToken();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearJumpFallback());

    // A new chat: reset positioning and wait for its first page.
    effect(() => {
      this.activeTarget();
      untracked(() => {
        this.positioned.set(false);
        this.visibleIds.clear();
        this.lastOutgoingId = null;
      });
    });

    effect(() => {
      const hasMessages = this.chatStore.messages().length > 0;
      if (!hasMessages || this.positioned()) {
        return;
      }
      untracked(() => {
        this.positioned.set(true);
        // Holds prefetch until the initial jump has landed.
        this.jumping.set(true);
        this.afterRender(() => this.applyInitialPosition());
      });
    });

    // Own message sent: follow it to the bottom.
    effect(() => {
      const last = this.chatStore.messages().at(-1);
      const outgoingId = last?.outgoing ? last.id : null;
      untracked(() => {
        if (outgoingId && outgoingId !== this.lastOutgoingId) {
          this.afterRender(() => this.virtualizer.scrollToEnd());
        }
        this.lastOutgoingId = outgoingId;
      });
    });

    effect(() => {
      const token = this.chatStore.scrollToLatestToken();
      if (token === this.scrollToLatestTokenAtInit) {
        return;
      }
      untracked(() =>
        this.afterRender(() => {
          this.startJump();
          this.virtualizer.scrollToEnd();
        }),
      );
    });

    // Jump to a message requested after the chat was positioned.
    effect(() => {
      const targetId = this.chatStore.targetScrollMessageId();
      const positioned = this.positioned();
      if (!targetId || !positioned) {
        return;
      }
      untracked(() =>
        this.afterRender(() => {
          if (this.chatStore.targetScrollMessageId() !== targetId) {
            return;
          }
          this.scrollToMessage(targetId, 'smooth');
        }),
      );
    });

    // Prefetch by pixel distance from an edge, well before the user reaches
    // it, so a fast fling keeps running into already loaded history. Loading
    // flags re-run this after each page, which repeats it while still close.
    effect(() => {
      const offset = this.virtualizer.scrollOffset() ?? 0;
      const total = this.virtualizer.getTotalSize();
      const viewport = this.virtualizer.scrollRect()?.height ?? 0;
      const blocked =
        !this.positioned() ||
        this.jumping() ||
        this.chatStore.loadingOlder() ||
        this.chatStore.loadingNewer();
      if (blocked || viewport <= 0 || this.rows().length === 0) {
        return;
      }
      const threshold = viewport * PREFETCH_VIEWPORTS;
      untracked(() => {
        if (offset < threshold && this.chatStore.hasMoreBefore()) {
          this.chatStore.requestPrevPage();
        } else if (
          total - offset - viewport < threshold &&
          this.chatStore.hasMoreAfter()
        ) {
          this.chatStore.requestNextPage();
        }
      });
    });

    // Rows dropped by the virtualizer can no longer report visibility.
    effect(() => {
      const rendered = new Set<string>();
      const rows = this.rows();
      for (const item of this.virtualItems()) {
        const row = rows[item.index];
        if (row?.kind === 'message') {
          rendered.add(row.message.id);
        }
      }
      untracked(() => {
        for (const id of this.visibleIds) {
          if (!rendered.has(id)) {
            this.visibleIds.delete(id);
          }
        }
      });
    });

    // Scrolling settled: finish a jump, then send what is on screen.
    effect(() => {
      const scrolling = this.virtualizer.isScrolling();
      untracked(() => {
        if (!this.jumping()) {
          return;
        }
        if (scrolling) {
          this.jumpSawScrolling = true;
        } else if (this.jumpSawScrolling) {
          this.finishJump();
        }
      });
    });

    effect(() => {
      if (this.readBlocked()) {
        return;
      }
      untracked(() => this.flushVisible());
    });
  }

  protected onMessageVisibility(message: IMessageEntity, visible: boolean) {
    if (visible) {
      this.visibleIds.add(message.id);
    } else {
      this.visibleIds.delete(message.id);
    }
    if (visible && !this.readBlocked()) {
      this.flushVisible();
    }
  }

  scrollToBottom(behavior: ScrollBehavior = 'instant'): void {
    this.afterRender(() =>
      this.virtualizer.scrollToEnd({
        behavior: behavior === 'instant' ? 'auto' : behavior,
      }),
    );
  }

  onScrollButtonClick(): void {
    if (this.hasMoreAfter() || this.unreadCount() > 0) {
      this.chatStore.readAllAndJumpToLatest();
      return;
    }
    this.scrollToBottom('smooth');
  }

  private applyInitialPosition(): void {
    const position = this.chatStore.initialPosition();
    const rows = this.rows();
    this.startJump();
    if (position === 'unread') {
      const index = rows.findIndex((row) => row.kind === 'divider');
      if (index >= 0) {
        this.virtualizer.scrollToIndex(index, { align: 'start' });
        return;
      }
    } else if (position === 'message') {
      const targetId = this.chatStore.targetScrollMessageId();
      if (targetId && this.scrollToMessage(targetId, 'auto')) {
        return;
      }
    }
    this.virtualizer.scrollToEnd();
  }

  /** Returns false when the message is not in the loaded window. */
  private scrollToMessage(id: string, behavior: ScrollBehavior): boolean {
    const index = this.rows().findIndex(
      (row) => row.kind === 'message' && row.message.id === id,
    );
    this.chatStore.setTargetScrollMessageId(null);
    if (index < 0) {
      return false;
    }
    this.startJump();
    this.pendingHighlightId = id;
    this.virtualizer.scrollToIndex(index, { align: 'center', behavior });
    return true;
  }

  private startJump(): void {
    this.jumping.set(true);
    this.jumpSawScrolling = false;
    this.clearJumpFallback();
    this.jumpFallbackTimer = setTimeout(() => {
      this.jumpFallbackTimer = null;
      if (!this.jumpSawScrolling && !this.virtualizer.isScrolling()) {
        this.finishJump();
      }
    }, JUMP_FALLBACK_MS);
  }

  /**
   * The virtualizer keeps correcting an index jump while rows get measured.
   * Prefetching during that would shift indexes under it, so the jump only
   * ends once the scroll position and content height stop changing.
   */
  private finishJump(): void {
    this.clearJumpFallback();
    this.jumpSawScrolling = false;
    const el = this.scrollContainerRef().nativeElement;
    let last = '';
    let stable = 0;
    let frames = 0;
    const check = (): void => {
      const current = `${el.scrollTop}:${el.scrollHeight}`;
      stable = current === last ? stable + 1 : 0;
      last = current;
      frames += 1;
      if (stable >= JUMP_STABLE_FRAMES || frames >= JUMP_MAX_SETTLE_FRAMES) {
        this.jumpFallbackTimer = null;
        this.endJump();
        return;
      }
      this.jumpFallbackTimer = setTimeout(check, FRAME_MS);
    };
    this.jumpFallbackTimer = setTimeout(check, FRAME_MS);
  }

  private endJump(): void {
    this.jumping.set(false);
    const highlightId = this.pendingHighlightId;
    this.pendingHighlightId = null;
    if (highlightId) {
      this.highlight(highlightId);
    }
  }

  private clearJumpFallback(): void {
    if (this.jumpFallbackTimer !== null) {
      clearTimeout(this.jumpFallbackTimer);
      this.jumpFallbackTimer = null;
    }
  }

  private highlight(id: string): void {
    const el = this.scrollContainerRef().nativeElement.querySelector(
      `[id="message-${id}"]`,
    );
    if (!el) {
      return;
    }
    el.classList.remove('message-highlight');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('message-highlight');
  }

  private flushVisible(): void {
    const byId = this.messagesById();
    const userId = this.currentUser()?.id ?? null;
    for (const id of this.visibleIds) {
      const message = byId.get(id);
      if (message && isReadTrackable(message, userId)) {
        this.readQueue.enqueue(id);
      }
    }
  }

  private estimateSize(row: ChatRow | undefined): number {
    if (!row) {
      return 0;
    }
    return estimateChatRowSize(row, this.listWidth);
  }

  private afterRender(write: () => void): void {
    afterNextRender(
      {
        write: () => {
          const width = this.scrollContainerRef().nativeElement.clientWidth;
          if (width > 0) {
            this.listWidth = width;
          }
          write();
        },
      },
      { injector: this.injector },
    );
  }
}
