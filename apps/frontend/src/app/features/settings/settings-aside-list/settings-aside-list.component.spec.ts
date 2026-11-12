import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, RouterLink } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiAsideComponent } from '@taiga-ui/layout';
import { beforeEach, describe, expect, it } from 'vitest';
import { EPermission, IUserFull } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { SettingsAsideListComponent } from './settings-aside-list.component';

describe('SettingsAsideListComponent', () => {
  let fixture: ComponentFixture<SettingsAsideListComponent>;
  let store: MockStore;
  let router: Router;

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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsAsideListComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: me }],
        }),
        { provide: TuiAsideComponent, useValue: { expanded: signal(true) } },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(SettingsAsideListComponent);
    fixture.detectChanges();
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
  ])('renders settings links for $name', ({ user, links }) => {
    store.overrideSelector(selectCurrentUser, user);
    store.refreshState();
    fixture.detectChanges();

    const group = fixture.nativeElement.querySelector('tui-aside-group');
    group.click();
    fixture.detectChanges();

    const rendered = fixture.debugElement
      .queryAll(By.directive(RouterLink))
      .map((element) => {
        const urlTree = element.injector.get(RouterLink).urlTree;
        return urlTree ? router.serializeUrl(urlTree) : '';
      });

    expect(rendered).toEqual(links);
  });
});
