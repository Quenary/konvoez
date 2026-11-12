import { computed, inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { EPermission } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { icons } from '@constants';

export interface ISettingsListEntry {
  link: string;
  icon: string;
  labelKey: string;
}

const PROFILE_ENTRY: ISettingsListEntry = {
  link: '/settings/profile',
  icon: icons['settings-profile'],
  labelKey: 'MENU.SETTINGS.PROFILE',
};

const SECURITY_ENTRY: ISettingsListEntry = {
  link: '/settings/security',
  icon: icons['settings-security'],
  labelKey: 'MENU.SETTINGS.SECURITY',
};

const DEVICES_ENTRY: ISettingsListEntry = {
  link: '/settings/devices',
  icon: icons['settings-devices'],
  labelKey: 'MENU.SETTINGS.DEVICES',
};

const NOTIFICATIONS_ENTRY: ISettingsListEntry = {
  link: '/settings/notifications',
  icon: icons['settings-notifications'],
  labelKey: 'MENU.SETTINGS.NOTIFICATIONS',
};

const INVITES_ENTRY: ISettingsListEntry = {
  link: '/settings/invites',
  icon: icons['settings-invites'],
  labelKey: 'MENU.SETTINGS.INVITES',
};

const USERS_ENTRY: ISettingsListEntry = {
  link: '/settings/users',
  icon: icons['settings-users'],
  labelKey: 'MENU.SETTINGS.USERS',
};

const ROLES_ENTRY: ISettingsListEntry = {
  link: '/settings/roles',
  icon: icons['settings-roles'],
  labelKey: 'MENU.SETTINGS.ROLES',
};

const ADMIN_ENTRY: ISettingsListEntry = {
  link: '/settings/admin',
  icon: icons['settings-admin'],
  labelKey: 'MENU.SETTINGS.ADMIN',
};

@Injectable()
export class SettingsListService {
  private readonly store = inject(Store);

  public readonly entries = computed(() => {
    const invites = this.canManageInvites();
    const users = this.canManageUsers();
    const roles = this.canManageRoles();
    const admin = this.canManageSettings();
    return [
      PROFILE_ENTRY,
      SECURITY_ENTRY,
      DEVICES_ENTRY,
      NOTIFICATIONS_ENTRY,
      ...(invites ? [INVITES_ENTRY] : []),
      ...(users ? [USERS_ENTRY] : []),
      ...(roles ? [ROLES_ENTRY] : []),
      ...(admin ? [ADMIN_ENTRY] : []),
    ];
  });

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  private readonly canManageInvites = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_INVITES),
    );
  });

  private readonly canManageUsers = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_USERS),
    );
  });

  private readonly canManageRoles = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_ROLES),
    );
  });

  private readonly canManageSettings = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_SETTINGS),
    );
  });
}
