import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { TuiCell, TuiIcon, TuiTitle } from '@taiga-ui/core';
import { TuiAutoColorPipe, TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';
import { IUser } from '@konvoez/shared';

@Component({
  selector: 'app-direct-chat-item',
  imports: [
    NgOptimizedImage,
    TuiCell,
    TuiIcon,
    TuiTitle,
    TuiAvatar,
    TuiInitialsPipe,
    TuiAutoColorPipe,
  ],
  templateUrl: './direct-chat-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectChatItemComponent {
  readonly user = input.required<IUser>();
  readonly selected = output<IUser>();
}
