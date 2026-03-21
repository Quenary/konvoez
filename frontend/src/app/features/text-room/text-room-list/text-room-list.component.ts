import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { selectTextRoomMessages } from '../text-room.selectors';
import { TextRoomMessageComponent } from '../text-room-message/text-room-message.component';
import { InfiniteScrollDirective } from 'ngx-infinite-scroll';
import { TextRoomActions } from '../text-room.actions';
import { ButtonModule } from 'primeng/button';
import { EMessageStatus } from '../text-room.reducer';

@Component({
  selector: 'app-text-room-list',
  imports: [TextRoomMessageComponent, InfiniteScrollDirective, ButtonModule],
  templateUrl: './text-room-list.component.html',
  styleUrl: './text-room-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomListComponent {
  private readonly store = inject(Store);

  protected readonly messages = this.store.selectSignal(selectTextRoomMessages);
  protected readonly showScrollToBottom = signal<boolean>(false);

  private readonly scrollContainerRef = viewChild.required<
    unknown,
    ElementRef<HTMLDivElement>
  >('scrollContainer', {
    read: ElementRef,
  });

  constructor() {
    const ref = effect(
      () => {
        const messages = this.messages();
        const scrollContainerRef = this.scrollContainerRef();
        if (messages?.length && scrollContainerRef) {
          this.scrollToBottom();
          ref.destroy();
        }
      },
      { manualCleanup: true },
    );
    effect(() => {
      const messages = this.messages();
      const last = messages.at(-1);
      const scrollContainerRef = this.scrollContainerRef();

      untracked(() => {
        // Scroll bottom on new message
        if (
          last &&
          last.status == EMessageStatus.LOADING &&
          scrollContainerRef
        ) {
          requestAnimationFrame(() => {
            scrollContainerRef.nativeElement.scrollTo({
              top: scrollContainerRef.nativeElement.scrollHeight,
              behavior: 'smooth',
            });
          });
        }
      });
    });
  }

  onScrollUp() {
    this.store.dispatch(TextRoomActions.requestNextPage());
  }

  onScrolled() {
    this.store.dispatch(TextRoomActions.requestPrevPage());
  }

  scrollToBottom() {
    const el = this.scrollContainerRef().nativeElement;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }
}
