import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { TuiAutoColorPipe, TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';

@Component({
  selector: 'app-user-avatar',
  imports: [NgOptimizedImage, TuiAvatar, TuiInitialsPipe, TuiAutoColorPipe],
  templateUrl: './user-avatar.component.html',
  styleUrl: './user-avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    {
      directive: TuiAvatar,
      inputs: ['size'],
    },
  ],
  host: {
    '[class.talking]': 'talking()',
  },
})
export class UserAvatarComponent {
  readonly username = input.required<string>();
  readonly fullname = input.required<string>();
  readonly avatarUrl = input.required<string | null | undefined>();
  readonly talking = input<boolean>(false);
}
