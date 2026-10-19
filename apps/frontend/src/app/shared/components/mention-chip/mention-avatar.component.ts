import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { TuiAutoColorPipe, TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { TMentionAvatarVm } from './mention-chip.vm';

@Component({
  selector: 'app-mention-avatar',
  imports: [
    UserAvatarComponent,
    TuiAvatar,
    TuiIcon,
    TuiInitialsPipe,
    TuiAutoColorPipe,
  ],
  templateUrl: './mention-avatar.component.html',
  styleUrl: './mention-avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MentionAvatarComponent {
  readonly avatar = input.required<TMentionAvatarVm>();
}
