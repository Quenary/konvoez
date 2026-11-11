import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiIcon, TuiTitle } from '@taiga-ui/core';
import { TuiFade } from '@taiga-ui/kit';
import { TuiHeader } from '@taiga-ui/layout';
import { LayoutService } from '@core/services/layout.service';
import { ListItemComponent } from '@shared/components/list-item/list-item.component';
import { RoutePageComponent } from '@shared/components/route-page/route-page.component';
import { icons } from '@constants';
import { SettingsListService } from '../settings-list.service';

@Component({
  selector: 'app-settings-list',
  imports: [
    ListItemComponent,
    RoutePageComponent,
    TranslatePipe,
    TuiFade,
    TuiHeader,
    TuiIcon,
    TuiTitle,
  ],
  providers: [SettingsListService],
  templateUrl: './settings-list.component.html',
  styleUrl: './settings-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsListComponent {
  protected readonly settingsList = inject(SettingsListService);
  private readonly router = inject(Router);
  private readonly layoutService = inject(LayoutService);

  protected readonly icons = icons;
  private readonly isNarrow = this.layoutService.isNarrow;

  constructor() {
    effect(() => {
      const isNarrow = this.isNarrow();
      untracked(() => {
        if (!isNarrow) {
          void this.router.navigate(['/settings/profile'], {
            replaceUrl: true,
          });
        }
      });
    });
  }
}
