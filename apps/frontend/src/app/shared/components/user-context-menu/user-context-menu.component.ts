import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiDataList, TuiOptGroup, TuiOption } from '@taiga-ui/core';

export interface IUserContextMoveTarget {
  id: number;
  name: string;
}

@Component({
  selector: 'app-user-context-menu',
  imports: [TranslatePipe, TuiDataList, TuiOptGroup, TuiOption],
  templateUrl: './user-context-menu.component.html',
  styleUrl: './user-context-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserContextMenuComponent {
  public readonly canModerate = input(false);
  public readonly moveTargets = input<readonly IUserContextMoveTarget[]>([]);

  public readonly details = output<void>();
  public readonly move = output<IUserContextMoveTarget>();
  public readonly disconnect = output<void>();
}
