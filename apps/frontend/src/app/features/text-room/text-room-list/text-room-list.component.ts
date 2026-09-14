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
import { EMessageStatus, TextRoomStore } from '../text-room.store';

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

  private readonly scrollContainerRef = viewChild.required<
    unknown,
    ElementRef<HTMLDivElement>
  >('scrollContainer', {
    read: ElementRef,
  });

  protected readonly showScrollToBottom = signal<boolean>(false);
  protected readonly infiniteScrollDisabled = signal<boolean>(true);

  constructor() {
    effect(() => {
      const messages = this.messages();
      const last = messages.at(-1);

      untracked(() => {
        if (last && last.status === EMessageStatus.LOADING) {
          this.scrollToBottom('smooth');
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
      .pipe(auditTime(100), takeUntilDestroyed(this.destroyRef))
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
    requestAnimationFrame(() => {
      const el = this.scrollContainerRef().nativeElement;
      el.scrollTo({
        top: el.scrollHeight,
        behavior,
      });
    });
  }
}
