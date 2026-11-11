import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { EPermission, IUserFull } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { SettingsListService } from './settings-list.service';

describe('SettingsListService', () => {
  let service: SettingsListService;
  let store: MockStore;

  const me: IUserFull = {
    id: 1,
    username: 'alice',
    email: 'alice@example.com',
    fullname: 'Alice',
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
    twoFactorEnabled: false,
    emailVerified: true,
    pendingEmail: null,
  };

  const baseLinks = [
    '/settings/profile',
    '/settings/security',
    '/settings/devices',
    '/settings/notifications',
  ];

  const managementLinks = [
    '/settings/invites',
    '/settings/users',
    '/settings/roles',
    '/settings/admin',
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SettingsListService,
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: me }],
        }),
      ],
    });

    service = TestBed.inject(SettingsListService);
    store = TestBed.inject(MockStore);
  });

  it.each([
    {
      name: 'a standard user',
      user: me,
      links: baseLinks,
    },
    {
      name: 'a user with management permissions',
      user: {
        ...me,
        permissions: [
          EPermission.MANAGE_INVITES,
          EPermission.MANAGE_USERS,
          EPermission.MANAGE_ROLES,
          EPermission.MANAGE_SETTINGS,
        ],
      },
      links: [...baseLinks, ...managementLinks],
    },
    {
      name: 'an owner',
      user: { ...me, isOwner: true },
      links: [...baseLinks, ...managementLinks],
    },
  ])('lists settings links for $name', ({ user, links }) => {
    store.overrideSelector(selectCurrentUser, user);
    store.refreshState();

    expect(service.entries().map((entry) => entry.link)).toEqual(links);
  });
});
