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
import { TuiButton, TuiHint } from '@taiga-ui/core';
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
/** Slack for subpixel rounding when deciding the list is at the bottom. */
const AT_BOTTOM_SLACK_PX = 2;
const WHEEL_LINE_PX = 16;
const KEYBOARD_LINE_PX = 40;
const KEYBOARD_PAGE_SHARE = 0.9;
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

  /**
   * Newest first: the list is inverted, so index 0 sits at the visual bottom
   * and scroll offset 0 is the latest message. Older pages are appended at
   * the far end of the scroll range and never shift what is on screen.
   */
  protected readonly rows = computed(() =>
    buildChatRows({
      messages: this.chatStore.messages(),
      unreadDividerMessageId: this.chatStore.unreadDividerMessageId(),
      loadingOlder: this.chatStore.loadingOlder(),
      loadingNewer: this.chatStore.loadingNewer(),
    }).reverse(),
  );

  protected readonly virtualizer = inject(CHAT_VIRTUALIZER_FACTORY)(() => {
    const rows = this.rows();
    return {
      scrollElement: this.scrollContainerRef(),
      count: rows.length,
      getItemKey: (index: number) => rows[index]?.key ?? index,
      estimateSize: (index: number) => this.estimateSize(rows[index]),
      // Keeps the row at the scroll offset in place when rows are inserted
      // before it, i.e. newer messages arriving while reading history.
      anchorTo: 'end',
      overscan: OVERSCAN_ROWS,
      gap: ROW_GAP_PX,
      paddingStart: LIST_PADDING_PX,
      paddingEnd: LIST_PADDING_PX,
      isScrollingResetDelay: SCROLLING_RESET_DELAY_MS,
    };
  });

  protected readonly virtualItems = this.virtualizer.getVirtualItems;
  protected readonly totalSize = this.virtualizer.getTotalSize;
  protected readonly measureElement = (element: HTMLElement | null): void =>
    this.virtualizer.measureElement(element);

  protected readonly hasMoreAfter = this.chatStore.hasMoreAfter;
  protected readonly unreadCount = computed(() =>
    this.unreadCountsStore.chatUnreadCount(this.activeTarget()),
  );
  private readonly farFromBottom = computed(
    () => (this.virtualizer.scrollOffset() ?? 0) > SCROLL_BUTTON_DISTANCE_PX,
  );
  protected readonly shouldShowScrollButton = computed(
    () => this.farFromBottom() || this.hasMoreAfter(),
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
  private newestKey: string | number | null = null;
  private listWidth = DEFAULT_LIST_WIDTH_PX;
  private readonly scrollToLatestTokenAtInit =
    this.chatStore.scrollToLatestToken();
  /** Store window the current position was applied to. */
  private positionedWindow = this.chatStore.windowVersion();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearJumpFallback());

    // A new chat: reset positioning and wait for its first page.
    effect(() => {
      this.activeTarget();
      untracked(() => {
        this.positioned.set(false);
        this.visibleIds.clear();
        this.lastOutgoingId = null;
        this.positionedWindow = this.chatStore.windowVersion();
      });
    });

    // A jump replaced the window with a slice around its target: position
    // from scratch, like opening the chat with a deep link. Old offsets mean
    // nothing for the new rows, and a smooth scroll across them would crawl.
    effect(() => {
      const version = this.chatStore.windowVersion();
      untracked(() => {
        if (version === this.positionedWindow) {
          return;
        }
        this.positionedWindow = version;
        this.positioned.set(false);
        this.visibleIds.clear();
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
          this.afterRender(() => this.scrollToLatest());
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
          this.scrollToLatest();
        }),
      );
    });

    // Jump to a message requested after the chat was positioned.
    effect(() => {
      const targetId = this.chatStore.targetScrollMessageId();
      const positioned = this.positioned();
      const freshWindow =
        this.chatStore.windowVersion() !== this.positionedWindow;
      if (!targetId || !positioned || freshWindow) {
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
        this.chatStore.reloadingWindow() ||
        this.chatStore.loadingOlder() ||
        this.chatStore.loadingNewer();
      if (blocked || viewport <= 0 || this.rows().length === 0) {
        return;
      }
      const threshold = viewport * PREFETCH_VIEWPORTS;
      untracked(() => {
        if (
          total - offset - viewport < threshold &&
          this.chatStore.hasMoreBefore()
        ) {
          this.chatStore.requestPrevPage();
        } else if (offset < threshold && this.chatStore.hasMoreAfter()) {
          this.chatStore.requestNextPage();
        }
      });
    });

    // A live message at the tail while the user is at the bottom: show it.
    // Anchoring would otherwise keep the previous newest row in place and
    // push the new one below the viewport.
    effect(() => {
      const newestKey = this.rows()[0]?.key ?? null;
      untracked(() => {
        const previous = this.newestKey;
        this.newestKey = newestKey;
        const atLiveBottom =
          this.positioned() &&
          !this.jumping() &&
          !this.chatStore.hasMoreAfter() &&
          this.scrollContainerRef().nativeElement.scrollTop <=
            AT_BOTTOM_SLACK_PX;
        if (previous !== null && previous !== newestKey && atLiveBottom) {
          this.afterRender(() => this.virtualizer.scrollToOffset(0));
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
      this.scrollToLatest(behavior === 'instant' ? 'auto' : behavior),
    );
  }

  /**
   * The container is flipped, so native wheel and keyboard scrolling would
   * run backwards. Both are re-applied with the sign inverted.
   */
  protected onWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.deltaY === 0) {
      return;
    }
    const el = this.scrollContainerRef().nativeElement;
    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? WHEEL_LINE_PX
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? el.clientHeight
          : 1;
    event.preventDefault();
    el.scrollTop -= event.deltaY * unit;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const el = this.scrollContainerRef().nativeElement;
    if (event.target !== el || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const page = el.clientHeight * KEYBOARD_PAGE_SHARE;
    const delta: Record<string, number> = {
      ArrowUp: KEYBOARD_LINE_PX,
      ArrowDown: -KEYBOARD_LINE_PX,
      PageUp: page,
      PageDown: -page,
      Home: el.scrollHeight,
      End: -el.scrollHeight,
    };
    const step = delta[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    el.scrollTop += step;
  }

  private scrollToLatest(behavior: ScrollBehavior = 'auto'): void {
    this.virtualizer.scrollToOffset(0, { behavior });
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
        // Flipped: the scroll end of the viewport is its visual top.
        this.virtualizer.scrollToIndex(index, { align: 'end' });
        return;
      }
    } else if (position === 'message') {
      const targetId = this.chatStore.targetScrollMessageId();
      if (targetId && this.scrollToMessage(targetId, 'auto')) {
        return;
      }
    }
    this.scrollToLatest();
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
