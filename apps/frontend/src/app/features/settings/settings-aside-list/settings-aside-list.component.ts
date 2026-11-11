import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiChevron } from '@taiga-ui/kit';
import { TuiNavigation } from '@taiga-ui/layout';
import { icons } from '@constants';
import { SettingsListService } from '../settings-list.service';

@Component({
  selector: 'app-settings-aside-list',
  imports: [RouterLink, TranslatePipe, TuiChevron, TuiNavigation],
  providers: [SettingsListService],
  templateUrl: './settings-aside-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsAsideListComponent {
  protected readonly settingsList = inject(SettingsListService);

  protected readonly icons = icons;
}
