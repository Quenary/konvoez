import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiCell, TuiIcon, TuiTitle } from '@taiga-ui/core';
import { icons } from '@constants';

@Component({
  selector: 'app-list-item',
  imports: [RouterLink, TuiCell, TuiIcon, TuiTitle],
  templateUrl: './list-item.component.html',
  styleUrl: './list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListItemComponent {
  public readonly link = input<string | null>(null);

  protected readonly icons = icons;
}
