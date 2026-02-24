import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { selectMessagesList } from '../text-room.selectors';
import { TextRoomMessageComponent } from '../text-room-message/text-room-message.component';
import { InfiniteScrollDirective } from 'ngx-infinite-scroll';
import { TextRoomActions } from '../text-room.actions';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-text-room-list',
  imports: [TextRoomMessageComponent, InfiniteScrollDirective, ButtonModule],
  templateUrl: './text-room-list.component.html',
  styleUrl: './text-room-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomListComponent {
  private readonly store = inject(Store);

  protected readonly messages = this.store.selectSignal(selectMessagesList);
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
