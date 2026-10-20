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
  OnInit,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiHint, TuiScrollbar } from '@taiga-ui/core';
import {
  TuiBadgedContent,
  TuiBadgeNotification,
  TuiSkeleton,
} from '@taiga-ui/kit';
import { auditTime, filter, fromEvent, switchMap, take, tap } from 'rxjs';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { ChatMessageComponent } from '../chat-message/chat-message.component';
import { ChatSystemItemComponent } from '../chat-system-item/chat-system-item.component';
import { ChatStore } from '../chat.store';
import { ChatTarget } from '../chat-target';

/** Slack for subpixel rounding when deciding the list is fully scrolled down. */
const bottomPinThresholdPx = 8;

type ScrollAnchor = {
  messageId: string;
  offset: number;
};

@Component({
  selector: 'app-chat-messages-list',
  imports: [
    ChatMessageComponent,
    ChatSystemItemComponent,
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
export class ChatMessagesListComponent implements OnInit {
  private readonly chatStore = inject(ChatStore);
  private readonly unreadCountsStore = inject(UnreadCountsStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly messages = this.chatStore.messages;
  protected readonly unreadDividerMessageId =
    this.chatStore.unreadDividerMessageId;
  protected readonly hasMoreAfter = this.chatStore.hasMoreAfter;
  protected readonly loadingOlder = this.chatStore.loadingOlder;
  protected readonly loadingNewer = this.chatStore.loadingNewer;
  protected readonly unreadCount = computed(() =>
    this.unreadCountsStore.chatUnreadCount(this.activeTarget()),
  );
  protected readonly showScrollToBottom = signal<boolean>(false);
  protected readonly shouldShowScrollButton = computed(
    () => this.showScrollToBottom() || this.hasMoreAfter(),
  );
  private readonly activeTarget = computed((): ChatTarget | null =>
    this.chatStore.target(),
  );

  private readonly scrollContainerRef = viewChild.required<
    unknown,
    ElementRef<HTMLElement>
  >('scrollContainer', {
    read: ElementRef,
  });
  private readonly topSentinelRef = viewChild('topSentinel', {
    read: ElementRef,
  });
  private readonly bottomSentinelRef = viewChild('bottomSentinel', {
    read: ElementRef,
  });

  private readonly renderKey = computed(() => ({
    ids: this.chatStore.ids(),
    older: this.loadingOlder(),
    newer: this.loadingNewer(),
  }));

  private lastOutgoingId: string | null = null;
  private pinnedToBottom = true;
  private positioning = false;
  private edgeLoadingEnabled = false;
  private topVisible = false;
  private bottomVisible = false;
  private wasLoadingOlder = false;
  private wasLoadingNewer = false;
  private previousLoadingOlder = false;
  private previousFirstMessageId: string | null | undefined = undefined;
  private edgeObserver: IntersectionObserver | null = null;
  private readonly scrollToLatestTokenAtInit =
    this.chatStore.scrollToLatestToken();

  constructor() {
    effect(() => {
      this.renderKey();
      const messages = this.messages();
      const last = messages.at(-1);
      const outgoingId = last?.outgoing ? last.id : null;

      untracked(() => {
        if (outgoingId && outgoingId !== this.lastOutgoingId) {
          this.lastOutgoingId = outgoingId;
          this.pinnedToBottom = true;
        } else if (!outgoingId) {
          this.lastOutgoingId = null;
        }

        if (this.positioning) {
          return;
        }

        const ids = this.chatStore.ids();
        const firstId = ids[0] != null ? String(ids[0]) : null;
        const isFirstSnapshot = this.previousFirstMessageId === undefined;
        const prepended =
          !isFirstSnapshot &&
          firstId !== null &&
          this.previousFirstMessageId !== null &&
          firstId !== this.previousFirstMessageId;
        const olderLoading = this.loadingOlder();
        const topInsetChanged =
          prepended || olderLoading !== this.previousLoadingOlder;

        const scrollEl = this.scrollContainerRef().nativeElement;
        const scrollSnapshot = !this.pinnedToBottom
          ? {
              scrollTop: scrollEl.scrollTop,
              scrollHeight: scrollEl.scrollHeight,
              anchor: this.captureAnchor(),
            }
          : null;

        afterNextRender(
          {
            write: () => {
              if (this.positioning) {
                return;
              }
              if (this.pinnedToBottom) {
                scrollEl.scrollTop = scrollEl.scrollHeight;
                return;
              }
              if (!scrollSnapshot) {
                return;
              }
              this.positioning = true;
              if (topInsetChanged) {
                const delta =
                  scrollEl.scrollHeight - scrollSnapshot.scrollHeight;
                if (delta !== 0) {
                  scrollEl.scrollTop = scrollSnapshot.scrollTop + delta;
                }
              } else if (scrollSnapshot.anchor) {
                this.restoreAnchor(scrollSnapshot.anchor);
              }
              this.positioning = false;
            },
          },
          { injector: this.injector },
        );

        this.previousFirstMessageId = firstId;
        this.previousLoadingOlder = olderLoading;
      });
    });

    effect(() => {
      const older = this.loadingOlder();
      const newer = this.loadingNewer();

      untracked(() => {
        if (this.wasLoadingNewer && !newer && this.bottomVisible) {
          afterNextRender(
            {
              write: () => {
                if (this.bottomVisible && this.edgeLoadingEnabled) {
                  this.chatStore.requestNextPage();
                }
              },
            },
            { injector: this.injector },
          );
        }
        this.wasLoadingOlder = older;
        this.wasLoadingNewer = newer;
      });
    });

    effect(() => {
      const token = this.chatStore.scrollToLatestToken();
      if (token === this.scrollToLatestTokenAtInit) {
        return;
      }

      untracked(() => {
        this.positioning = true;
        afterNextRender(
          {
            write: () => {
              const el = this.scrollContainerRef().nativeElement;
              el.scrollTop = el.scrollHeight;
              this.pinnedToBottom = true;
              this.positioning = false;
            },
          },
          { injector: this.injector },
        );
      });
    });

    effect(() => {
      const targetScrollMessageId = this.chatStore.targetScrollMessageId();
      if (!targetScrollMessageId) {
        return;
      }

      untracked(() => {
        this.positioning = true;
        afterNextRender(
          {
            write: () => {
              const el = document.getElementById(
                `message-${targetScrollMessageId}`,
              );
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.remove('message-highlight');
                void el.offsetWidth;
                el.classList.add('message-highlight');
              }
              this.chatStore.setTargetScrollMessageId(null);
              this.positioning = false;
            },
          },
          { injector: this.injector },
        );
      });
    });
  }

  ngOnInit(): void {
    const scrollEl = this.scrollContainerRef().nativeElement;
    fromEvent(scrollEl, 'scroll')
      .pipe(
        tap(($event) => {
          const el = $event.target as HTMLElement;
          this.pinnedToBottom = this.isAtBottom(el);
        }),
        auditTime(100),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(($event) => {
        const el = $event.target as HTMLElement;
        this.showScrollToBottom.set(
          el.scrollTop + el.clientHeight < el.scrollHeight - 200,
        );
      });

    afterNextRender(
      () => {
        this.edgeObserver = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const topEl = this.topSentinelRef()?.nativeElement;
              const bottomEl = this.bottomSentinelRef()?.nativeElement;
              if (entry.target === topEl) {
                this.topVisible = entry.isIntersecting;
                if (
                  entry.isIntersecting &&
                  this.edgeLoadingEnabled &&
                  !this.positioning &&
                  !this.loadingOlder() &&
                  !this.loadingNewer()
                ) {
                  this.chatStore.requestPrevPage();
                }
              } else if (entry.target === bottomEl) {
                this.bottomVisible = entry.isIntersecting;
                if (
                  entry.isIntersecting &&
                  this.edgeLoadingEnabled &&
                  !this.positioning &&
                  !this.loadingOlder() &&
                  !this.loadingNewer()
                ) {
                  this.chatStore.requestNextPage();
                }
              }
            }
          },
          { root: scrollEl, rootMargin: '300px 0px', threshold: 0 },
        );

        const topEl = this.topSentinelRef()?.nativeElement;
        const bottomEl = this.bottomSentinelRef()?.nativeElement;
        if (topEl) {
          this.edgeObserver.observe(topEl);
        }
        if (bottomEl) {
          this.edgeObserver.observe(bottomEl);
        }
      },
      { injector: this.injector },
    );

    this.destroyRef.onDestroy(() => {
      this.edgeObserver?.disconnect();
      this.edgeObserver = null;
    });

    toObservable(this.activeTarget, {
      injector: this.injector,
    })
      .pipe(
        tap(() => {
          this.edgeLoadingEnabled = false;
          this.previousLoadingOlder = false;
          this.previousFirstMessageId = undefined;
        }),
        switchMap(() =>
          toObservable(this.chatStore.messages, {
            injector: this.injector,
          }).pipe(
            filter((messages) => messages.length > 0),
            take(1),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.applyInitialPosition();
      });
  }

  scrollToBottom(behavior: ScrollBehavior = 'instant'): void {
    this.pinnedToBottom = true;
    afterNextRender(
      {
        write: () => {
          const el = this.scrollContainerRef().nativeElement;
          el.scrollTo({
            top: el.scrollHeight,
            behavior,
          });
        },
      },
      { injector: this.injector },
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
    this.positioning = true;
    afterNextRender(
      {
        write: () => {
          if (position === 'unread') {
            const divider = document.getElementById('unread-divider');
            if (divider) {
              divider.scrollIntoView({ behavior: 'instant', block: 'start' });
              this.pinnedToBottom = false;
            } else {
              const el = this.scrollContainerRef().nativeElement;
              el.scrollTop = el.scrollHeight;
              this.pinnedToBottom = true;
            }
          } else if (position === 'message') {
            const targetId = this.chatStore.targetScrollMessageId();
            const el = targetId
              ? document.getElementById(`message-${targetId}`)
              : null;
            if (el) {
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              el.classList.remove('message-highlight');
              void el.offsetWidth;
              el.classList.add('message-highlight');
              this.pinnedToBottom = false;
              this.chatStore.setTargetScrollMessageId(null);
            } else {
              const scrollEl = this.scrollContainerRef().nativeElement;
              scrollEl.scrollTop = scrollEl.scrollHeight;
              this.pinnedToBottom = true;
            }
          } else {
            const scrollEl = this.scrollContainerRef().nativeElement;
            scrollEl.scrollTop = scrollEl.scrollHeight;
            this.pinnedToBottom = true;
          }

          this.positioning = false;
          this.edgeLoadingEnabled = true;
          if (this.topVisible) {
            this.chatStore.requestPrevPage();
          }
          if (this.bottomVisible) {
            this.chatStore.requestNextPage();
          }
        },
      },
      { injector: this.injector },
    );
  }

  private captureAnchor(): ScrollAnchor | null {
    const el = this.scrollContainerRef().nativeElement;
    const containerRect = el.getBoundingClientRect();
    const firstVisible = Array.from(
      el.querySelectorAll<HTMLElement>('app-chat-message'),
    ).find(
      (message) => message.getBoundingClientRect().bottom > containerRect.top,
    );
    if (!firstVisible) {
      return null;
    }
    const messageId = firstVisible.getAttribute('data-message-id');
    if (!messageId) {
      return null;
    }
    const rect = firstVisible.getBoundingClientRect();
    return {
      messageId,
      offset: rect.top - containerRect.top,
    };
  }

  private restoreAnchor(anchor: ScrollAnchor): void {
    const el = this.scrollContainerRef().nativeElement;
    const containerRect = el.getBoundingClientRect();
    const messageEl = el.querySelector<HTMLElement>(
      `[data-message-id="${anchor.messageId}"]`,
    );
    if (!messageEl) {
      return;
    }
    const newOffset = messageEl.getBoundingClientRect().top - containerRect.top;
    el.scrollTop += newOffset - anchor.offset;
  }

  private isAtBottom(el: HTMLElement): boolean {
    return (
      el.scrollHeight - el.scrollTop - el.clientHeight <= bottomPinThresholdPx
    );
  }
}
