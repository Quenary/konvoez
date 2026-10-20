import {
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
import { InfiniteScrollDirective } from 'ngx-infinite-scroll';
import { TuiButton, TuiHint } from '@taiga-ui/core';
import { TuiBadgedContent, TuiBadgeNotification } from '@taiga-ui/kit';
import { auditTime, filter, fromEvent, switchMap, take, tap } from 'rxjs';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { ChatMessageComponent } from '../chat-message/chat-message.component';
import { ChatSystemItemComponent } from '../chat-system-item/chat-system-item.component';
import { ChatStore } from '../chat.store';
import { ChatTarget } from '../chat-target';

/** Slack for subpixel rounding when deciding the list is fully scrolled down. */
const bottomPinThresholdPx = 8;

@Component({
  selector: 'app-chat-messages-list',
  imports: [
    ChatMessageComponent,
    ChatSystemItemComponent,
    InfiniteScrollDirective,
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
  protected readonly unreadCount = computed(() =>
    this.unreadCountsStore.chatUnreadCount(this.activeTarget()),
  );
  protected readonly showScrollToBottom = signal<boolean>(false);
  protected readonly shouldShowScrollButton = computed(
    () => this.showScrollToBottom() || this.hasMoreAfter(),
  );
  protected readonly infiniteScrollDisabled = signal<boolean>(true);

  private readonly activeTarget = computed((): ChatTarget | null =>
    this.chatStore.target(),
  );

  private readonly scrollContainerRef = viewChild.required<
    unknown,
    ElementRef<HTMLDivElement>
  >('scrollContainer', {
    read: ElementRef,
  });
  private lastOutgoingId: string | null = null;
  /** `undefined` until the first messages read, so the initial page does not count as a new head. */
  private headMessageId: string | null | undefined = undefined;
  /** `undefined` until the first messages read, so the initial page does not count as a new tail. */
  private tailMessageId: string | null | undefined = undefined;
  private prependAnchor: { element: HTMLElement; top: number } | null = null;
  private pinnedToBottom = true;

  constructor() {
    effect(() => {
      const messages = this.messages();
      const first = messages.at(0);
      const last = messages.at(-1);
      const headId = first?.id ?? null;
      const tailId = last?.id ?? null;
      const outgoingId = last?.outgoing ? last.id : null;

      untracked(() => {
        if (messages.length === 0) {
          this.tailMessageId = undefined;
          this.headMessageId = undefined;
          this.lastOutgoingId = null;
          this.prependAnchor = null;
          return;
        }

        const isFirstRead =
          this.tailMessageId === undefined || this.headMessageId === undefined;
        const tailChanged = !isFirstRead && tailId !== this.tailMessageId;
        const headChanged = !isFirstRead && headId !== this.headMessageId;
        const previousHeadIsStillLoaded =
          this.headMessageId !== null &&
          messages.some((message) => message.id === this.headMessageId);

        const isPrepend =
          !isFirstRead &&
          headChanged &&
          headId !== null &&
          previousHeadIsStillLoaded;

        this.tailMessageId = tailId;
        this.headMessageId = headId;

        if (isPrepend) {
          const el = this.scrollContainerRef().nativeElement;
          const anchor = this.prependAnchor;
          this.prependAnchor = null;
          requestAnimationFrame(() => {
            if (!anchor?.element.isConnected) {
              return;
            }
            const containerTop = el.getBoundingClientRect().top;
            const top =
              anchor.element.getBoundingClientRect().top - containerTop;
            el.scrollTop += top - anchor.top;
          });
          return;
        }
        if (isFirstRead || headChanged) {
          this.prependAnchor = null;
        }

        if (outgoingId && outgoingId !== this.lastOutgoingId) {
          this.lastOutgoingId = outgoingId;
          this.scrollToBottom('smooth');
          return;
        }
        if (!outgoingId) {
          this.lastOutgoingId = null;
        }

        if (tailChanged && this.pinnedToBottom) {
          this.scrollToBottom();
        }
      });
    });

    effect(() => {
      const targetScrollMessageId = this.chatStore.targetScrollMessageId();
      if (!targetScrollMessageId) {
        return;
      }

      untracked(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
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
          }, 50);
        });
      });
    });
  }

  ngOnInit(): void {
    const scrollContainerRef = this.scrollContainerRef();
    fromEvent(scrollContainerRef.nativeElement, 'scroll')
      .pipe(
        tap(($event) => {
          const el = $event.target as HTMLDivElement;
          this.pinnedToBottom = this.isAtBottom(el);
        }),
        auditTime(100),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(($event) => {
        const el = $event.target as HTMLDivElement;
        this.showScrollToBottom.set(
          el.scrollTop + el.clientHeight < el.scrollHeight - 200,
        );
      });

    toObservable(this.activeTarget, {
      injector: this.injector,
    })
      .pipe(
        tap(() => {
          this.infiniteScrollDisabled.set(true);
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
        setTimeout(() => {
          this.infiniteScrollDisabled.set(false);
        }, 300);
      });
  }

  onScrollUp(): void {
    const el = this.scrollContainerRef().nativeElement;
    const containerRect = el.getBoundingClientRect();
    const firstVisibleMessage = Array.from(
      el.querySelectorAll<HTMLElement>('app-chat-message'),
    ).find(
      (message) => message.getBoundingClientRect().bottom > containerRect.top,
    );
    this.prependAnchor = firstVisibleMessage
      ? {
          element: firstVisibleMessage,
          top:
            firstVisibleMessage.getBoundingClientRect().top - containerRect.top,
        }
      : null;
    this.chatStore.requestPrevPage();
  }

  onScrolled(): void {
    this.chatStore.requestNextPage();
  }

  scrollToBottom(behavior: ScrollBehavior = 'instant'): void {
    this.pinnedToBottom = true;
    requestAnimationFrame(() => {
      const el = this.scrollContainerRef().nativeElement;
      el.scrollTo({
        top: el.scrollHeight,
        behavior,
      });
    });
  }

  onScrollButtonClick(): void {
    if (this.hasMoreAfter() || this.unreadCount() > 0) {
      this.chatStore.readAllAndJumpToLatest();
    }
    this.scrollToBottom('smooth');
  }

  private applyInitialPosition(): void {
    const position = this.chatStore.initialPosition();
    requestAnimationFrame(() => {
      if (position === 'unread') {
        const divider = document.getElementById('unread-divider');
        if (divider) {
          divider.scrollIntoView({ behavior: 'instant', block: 'start' });
          this.pinnedToBottom = false;
        } else {
          this.scrollToBottom();
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
          this.scrollToBottom();
        }
      } else {
        this.scrollToBottom();
      }
    });
  }

  private isAtBottom(el: HTMLElement): boolean {
    return (
      el.scrollHeight - el.scrollTop - el.clientHeight <= bottomPinThresholdPx
    );
  }
}
