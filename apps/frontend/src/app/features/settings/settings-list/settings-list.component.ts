import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiIcon, TuiTitle } from '@taiga-ui/core';
import { TuiFade } from '@taiga-ui/kit';
import { TuiHeader } from '@taiga-ui/layout';
import { EPermission } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { LayoutService } from '@core/services/layout.service';
import { ListItemComponent } from '@shared/components/list-item/list-item.component';
import { RoutePageComponent } from '@shared/components/route-page/route-page.component';
import { icons } from '@constants';

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
  templateUrl: './settings-list.component.html',
  styleUrl: './settings-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsListComponent {
  private readonly router = inject(Router);
  private readonly store = inject(Store);
  private readonly layoutService = inject(LayoutService);

  protected readonly icons = icons;
  protected readonly isNarrow = this.layoutService.isNarrow;
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected readonly canManageInvites = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_INVITES),
    );
  });

  protected readonly canManageUsers = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_USERS),
    );
  });

  protected readonly canManageRoles = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_ROLES),
    );
  });

  protected readonly canManageSettings = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_SETTINGS),
    );
  });

  protected readonly entries = computed(() => {
    const invites = this.canManageInvites();
    const users = this.canManageUsers();
    const roles = this.canManageRoles();
    const admin = this.canManageSettings();
    return [
      {
        link: '/settings/profile',
        icon: this.icons['settings-profile'],
        labelKey: 'MENU.SETTINGS.PROFILE',
      },
      {
        link: '/settings/security',
        icon: this.icons['settings-security'],
        labelKey: 'MENU.SETTINGS.SECURITY',
      },
      {
        link: '/settings/devices',
        icon: this.icons['settings-devices'],
        labelKey: 'MENU.SETTINGS.DEVICES',
      },
      {
        link: '/settings/notifications',
        icon: this.icons['settings-notifications'],
        labelKey: 'MENU.SETTINGS.NOTIFICATIONS',
      },
      ...(invites
        ? [
            {
              link: '/settings/invites',
              icon: this.icons['settings-invites'],
              labelKey: 'MENU.SETTINGS.INVITES',
            },
          ]
        : []),
      ...(users
        ? [
            {
              link: '/settings/users',
              icon: this.icons['settings-users'],
              labelKey: 'MENU.SETTINGS.USERS',
            },
          ]
        : []),
      ...(roles
        ? [
            {
              link: '/settings/roles',
              icon: this.icons['settings-roles'],
              labelKey: 'MENU.SETTINGS.ROLES',
            },
          ]
        : []),
      ...(admin
        ? [
            {
              link: '/settings/admin',
              icon: this.icons['settings-admin'],
              labelKey: 'MENU.SETTINGS.ADMIN',
            },
          ]
        : []),
    ];
  });

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
