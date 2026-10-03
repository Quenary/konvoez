import {
  ChangeDetectionStrategy,
  Component,
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
import { InfiniteScrollDirective } from 'ngx-infinite-scroll';
import { TuiButton } from '@taiga-ui/core';
import {
  auditTime,
  combineLatest,
  filter,
  fromEvent,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { TextRoomMessageComponent } from '../text-room-message/text-room-message.component';
import { TextRoomStore } from '../text-room.store';

/** Slack for subpixel rounding when deciding the list is fully scrolled down. */
const bottomPinThresholdPx = 8;

@Component({
  selector: 'app-text-room-list',
  imports: [TextRoomMessageComponent, InfiniteScrollDirective, TuiButton],
  templateUrl: './text-room-list.component.html',
  styleUrl: './text-room-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomListComponent implements OnInit {
  private readonly textRoomStore = inject(TextRoomStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly messages = this.textRoomStore.messages;
  protected readonly showScrollToBottom = signal<boolean>(false);
  protected readonly infiniteScrollDisabled = signal<boolean>(true);

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
      const targetScrollMessageId = this.textRoomStore.targetScrollMessageId();
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
            this.textRoomStore.setTargetScrollMessageId(null);
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

    combineLatest([
      toObservable(this.textRoomStore.selectedRoomId, {
        injector: this.injector,
      }),
      toObservable(this.textRoomStore.selectedRecipientId, {
        injector: this.injector,
      }),
    ])
      .pipe(
        tap(() => {
          this.infiniteScrollDisabled.set(true);
        }),
        switchMap(() =>
          toObservable(this.textRoomStore.messages, {
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
    this.textRoomStore.requestPrevPage();
  }

  onScrolled(): void {
    this.textRoomStore.requestNextPage();
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
