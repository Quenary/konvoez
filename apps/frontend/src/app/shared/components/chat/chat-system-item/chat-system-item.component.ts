import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-chat-system-item',
  imports: [],
  templateUrl: './chat-system-item.component.html',
  styleUrl: './chat-system-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatSystemItemComponent {
  public readonly text = input<string | null>(null);
}
