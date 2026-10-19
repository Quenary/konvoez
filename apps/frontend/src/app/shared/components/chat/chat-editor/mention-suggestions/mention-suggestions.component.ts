import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { TuiDataList, TuiOption } from '@taiga-ui/core';
import { MentionAvatarComponent } from '@shared/components/mention-chip/mention-avatar.component';
import { TMentionAvatarVm } from '@shared/components/mention-chip/mention-chip.vm';

export interface IMentionSuggestionVm {
  key: string;
  kind: 'user' | 'role' | 'everyone';
  id: number | null;
  label: string;
  secondary: string;
  avatar: TMentionAvatarVm;
  active: boolean;
}

@Component({
  selector: 'app-mention-suggestions',
  imports: [TuiDataList, TuiOption, MentionAvatarComponent],
  templateUrl: './mention-suggestions.component.html',
  styleUrl: './mention-suggestions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MentionSuggestionsComponent {
  readonly items = input.required<readonly IMentionSuggestionVm[]>();
  readonly picked = output<IMentionSuggestionVm>();
}
