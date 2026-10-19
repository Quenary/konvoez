import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TuiChip } from '@taiga-ui/kit';
import { MentionAvatarComponent } from './mention-avatar.component';
import { IMentionChipVm } from './mention-chip.vm';

@Component({
  selector: 'app-mention-chip',
  imports: [TuiChip, MentionAvatarComponent],
  templateUrl: './mention-chip.component.html',
  styleUrl: './mention-chip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-type]': '"mention"',
    '[attr.data-kind]': 'vm().kind',
    '[attr.data-id]': 'vm().id',
    '[class.mention-chip-me]': 'vm().isMe',
  },
})
export class MentionChipComponent {
  readonly vm = input.required<IMentionChipVm>();
}
