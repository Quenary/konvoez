import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Store } from '@ngrx/store';
import {
  selectTextRoomMessagesList,
  selectTextRoomSelectedId,
  selectTextRoomSelectedRecipientId,
} from '../text-room.selectors';
import { TextRoomMessageComponent } from '../text-room-message/text-room-message.component';
import { InfiniteScrollDirective } from 'ngx-infinite-scroll';
import { TextRoomActions } from '../text-room.actions';
import { EMessageStatus } from '../text-room.reducer';
import {
  auditTime,
  combineLatest,
  filter,
  fromEvent,
  switchMap,
  take,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TuiButton } from '@taiga-ui/core';

@Component({
  selector: 'app-text-room-list',
  imports: [TextRoomMessageComponent, InfiniteScrollDirective, TuiButton],
  templateUrl: './text-room-list.component.html',
  styleUrl: './text-room-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomListComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly messages = this.store.selectSignal(
    selectTextRoomMessagesList,
  );

  private readonly scrollContainerRef = viewChild.required<
    unknown,
    ElementRef<HTMLDivElement>
  >('scrollContainer', {
    read: ElementRef,
  });

  protected readonly showScrollToBottom = signal<boolean>(false);
  protected readonly infiniteScrollDisabled = signal<boolean>(true);

  constructor() {
    // Scroll bottom on new message
    effect(() => {
      const messages = this.messages();
      const last = messages.at(-1);

      untracked(() => {
        if (last && last.status == EMessageStatus.LOADING) {
          this.scrollToBottom('smooth');
        }
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

    // initial scroll to bottom
    combineLatest([
      this.store.select(selectTextRoomSelectedId),
      this.store.select(selectTextRoomSelectedRecipientId),
    ])
      .pipe(
        switchMap(() =>
          this.store.select(selectTextRoomMessagesList).pipe(
            filter((messages) => messages.length > 0),
            take(1),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        console.log('scroll to bottom');
        this.scrollToBottom();
        setTimeout(() => {
          this.infiniteScrollDisabled.set(false);
        }, 300);
      });

    // Disable initial scroll
    combineLatest([
      this.store.select(selectTextRoomSelectedId),
      this.store.select(selectTextRoomSelectedRecipientId),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.infiniteScrollDisabled.set(true);
      });
  }

  onScrollUp() {
    this.store.dispatch(TextRoomActions.requestPrevPage());
  }

  onScrolled() {
    this.store.dispatch(TextRoomActions.requestNextPage());
  }

  scrollToBottom(behavior: ScrollBehavior = 'instant') {
    requestAnimationFrame(() => {
      const el = this.scrollContainerRef().nativeElement;
      el.scrollTo({
        top: el.scrollHeight,
        behavior,
      });
    });
  }
}
