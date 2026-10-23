import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiDataList, TuiOptGroup, TuiOption } from '@taiga-ui/core';

import { icons } from '@constants';

@Component({
  selector: 'app-room-context-menu',
  imports: [TranslatePipe, TuiDataList, TuiOptGroup, TuiOption],
  templateUrl: './room-context-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomContextMenuComponent {
  protected readonly icons = icons;
  public readonly roomName = input.required<string>();

  public readonly edit = output<void>();
  public readonly delete = output<void>();
}
