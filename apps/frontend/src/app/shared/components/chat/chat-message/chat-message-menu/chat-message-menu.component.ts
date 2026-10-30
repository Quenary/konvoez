import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiDataList, TuiOption } from '@taiga-ui/core';
import { icons } from '@constants';
import { IOutgoingMessage } from '@core/chat/outgoing/outgoing.types';
import { IMessageEntity } from '../../chat.store';
import { ChatMessageReactionsBarComponent } from '../chat-message-reactions-bar/chat-message-reactions-bar.component';

@Component({
  selector: 'app-chat-message-menu',
  imports: [
    TranslatePipe,
    TuiDataList,
    TuiOption,
    ChatMessageReactionsBarComponent,
  ],
  templateUrl: './chat-message-menu.component.html',
  styleUrl: './chat-message-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageMenuComponent {
  public readonly isDialog = input<boolean>(false);
  public readonly message = input.required<IMessageEntity>();
  public readonly outgoing = input<IOutgoingMessage | null>(null);
  public readonly canCancelSending = input<boolean>(false);
  public readonly canEdit = input<boolean>(false);
  public readonly canDelete = input<boolean>(false);
  public readonly canViewReaders = input<boolean>(false);
  public readonly currentUserId = input<number | null>(null);

  public readonly react = output<string>();
  public readonly reply = output<void>();
  public readonly edit = output<void>();
  public readonly delete = output<void>();
  public readonly cancelSending = output<void>();
  public readonly viewReaders = output<void>();

  protected readonly icons = icons;

  protected onReact(emoji: string): void {
    this.react.emit(emoji);
  }

  protected onReply(): void {
    this.reply.emit();
  }

  protected onEdit(): void {
    this.edit.emit();
  }

  protected onDelete(): void {
    this.delete.emit();
  }

  protected onCancelSending(): void {
    this.cancelSending.emit();
  }

  protected onViewReaders(): void {
    this.viewReaders.emit();
  }
}
