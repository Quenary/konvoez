import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { TuiHint } from '@taiga-ui/core';
import { ITextRoomReactionGroup } from '@konvoez/shared';
import { UsersStore } from '@core/stores/users.store';

export interface IReactionViewModel {
  readonly emoji: string;
  readonly count: number;
  readonly isReactedByMe: boolean;
  readonly tooltip: string;
}

@Component({
  selector: 'app-chat-message-reactions',
  imports: [TuiHint],
  templateUrl: './chat-message-reactions.component.html',
  styleUrl: './chat-message-reactions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageReactionsComponent {
  // 1. Every inject() call
  private readonly usersStore = inject(UsersStore);
  private readonly translateService = inject(TranslateService);

  // 2. Other fields from public to private
  public readonly reactions = input<ITextRoomReactionGroup[]>([]);
  public readonly currentUserId = input<number | null>(null);

  public readonly react = output<string>();

  protected readonly translateLabels = toSignal(
    this.translateService.stream(['REACTIONS.YOU', 'REACTIONS.UNKNOWN_USER']),
  );

  protected readonly reactionViewModels = computed<
    readonly IReactionViewModel[]
  >(() => {
    // Read every tracked signal first
    const reactions = this.reactions();
    const currentUserId = this.currentUserId();
    const entityMap = this.usersStore.entityMap();
    const labels = this.translateLabels();
    const youText = labels?.['REACTIONS.YOU'] ?? 'You';
    const unknownUserTemplate =
      labels?.['REACTIONS.UNKNOWN_USER'] ?? 'User #{{ id }}';

    return reactions.map((group) => {
      const isReactedByMe =
        currentUserId !== null && group.userIds.includes(currentUserId);
      const names: string[] = [];

      if (isReactedByMe) {
        names.push(youText);
      }

      for (const id of group.userIds) {
        if (id !== currentUserId) {
          const username =
            entityMap[id]?.username ??
            unknownUserTemplate.replace(/\{\{\s*id\s*\}\}/g, String(id));
          names.push(username);
        }
      }

      let tooltip = names.join(', ');
      const MAX_TOOLTIP_NAMES = 10;
      if (names.length > MAX_TOOLTIP_NAMES) {
        const shown = names.slice(0, MAX_TOOLTIP_NAMES);
        const remaining = names.length - MAX_TOOLTIP_NAMES;
        tooltip = `${shown.join(', ')} +${remaining}`;
      }

      return {
        emoji: group.emoji,
        count: group.count,
        isReactedByMe,
        tooltip,
      };
    });
  });

  // 4. Methods from public to private
  protected onPillClick(emoji: string, event: MouseEvent): void {
    event.stopPropagation();
    this.react.emit(emoji);
  }
}
