import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiHint, TuiIcon } from '@taiga-ui/core';
import { ITextRoomReactionGroup } from '@konvoez/shared';
import {
  EMOJI_CATEGORIES,
  getRecentEmojis,
  saveRecentEmoji,
} from './emoji.data';

@Component({
  selector: 'app-chat-message-reactions-bar',
  imports: [TranslatePipe, TuiHint, TuiIcon],
  templateUrl: './chat-message-reactions-bar.component.html',
  styleUrl: './chat-message-reactions-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageReactionsBarComponent {
  // 1. Every inject() call
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  // 2. Other fields from public to private
  public readonly reactions = input<ITextRoomReactionGroup[]>([]);
  public readonly currentUserId = input<number | null>(null);

  public readonly react = output<string>();

  protected readonly isExpanded = signal(false);
  protected readonly quickEmojis = signal<string[]>(getRecentEmojis());
  protected readonly categories = EMOJI_CATEGORIES;

  protected readonly userActiveEmoji = computed(() => {
    // Read every tracked signal first
    const uid = this.currentUserId();
    const reactions = this.reactions();
    if (!uid) {
      return null;
    }
    return reactions.find((r) => r.userIds.includes(uid))?.emoji ?? null;
  });

  protected onEmojiSelect(emoji: string): void {
    saveRecentEmoji(emoji);
    this.quickEmojis.set(getRecentEmojis());
    this.react.emit(emoji);
  }

  protected toggleExpand(): void {
    this.isExpanded.update((v) => !v);
  }

  protected scrollToCategory(categoryId: string): void {
    const el = this.elementRef.nativeElement.querySelector(
      `#emoji-cat-${categoryId}`,
    );
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
