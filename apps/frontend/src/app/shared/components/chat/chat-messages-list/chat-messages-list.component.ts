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
import { auditTime, filter, fromEvent, switchMap, take, tap } from 'rxjs';
import { ChatMessageComponent } from '../chat-message/chat-message.component';
import { ChatStore } from '../chat.store';
import { ChatTarget } from '../chat-target';

/** Slack for subpixel rounding when deciding the list is fully scrolled down. */
const bottomPinThresholdPx = 8;

@Component({
  selector: 'app-chat-messages-list',
  imports: [
    ChatMessageComponent,
    InfiniteScrollDirective,
    TuiButton,
    TranslatePipe,
    TuiHint,
  ],
  templateUrl: './chat-messages-list.component.html',
  styleUrl: './chat-messages-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessagesListComponent implements OnInit {
  private readonly chatStore = inject(ChatStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly messages = this.chatStore.messages;
  protected readonly showScrollToBottom = signal<boolean>(false);
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
  /** `undefined` until the first messages read, so the initial page does not count as a new tail. */
  private tailMessageId: string | null | undefined = undefined;
  private pinnedToBottom = true;

  constructor() {
    effect(() => {
      const messages = this.messages();
      const last = messages.at(-1);
      const tailId = last?.id ?? null;
      const outgoingId = last?.outgoing ? last.id : null;

      untracked(() => {
        const isFirstRead = this.tailMessageId === undefined;
        const tailChanged = !isFirstRead && tailId !== this.tailMessageId;
        this.tailMessageId = tailId;

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
        this.scrollToBottom();
        setTimeout(() => {
          this.infiniteScrollDisabled.set(false);
        }, 300);
      });
  }

  onScrollUp(): void {
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

  private isAtBottom(el: HTMLElement): boolean {
    return (
      el.scrollHeight - el.scrollTop - el.clientHeight <= bottomPinThresholdPx
    );
  }
}
