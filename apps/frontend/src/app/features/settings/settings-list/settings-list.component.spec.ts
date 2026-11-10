import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EPermission, IUserFull } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { LayoutService } from '@core/services/layout.service';
import { SettingsListComponent } from './settings-list.component';

describe('SettingsListComponent', () => {
  let fixture: ComponentFixture<SettingsListComponent>;
  let component: SettingsListComponent;
  let router: Router;
  let store: MockStore;
  const isNarrowSignal = signal(true);

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

  beforeEach(async () => {
    isNarrowSignal.set(true);

    await TestBed.configureTestingModule({
      imports: [SettingsListComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: me }],
        }),
        {
          provide: LayoutService,
          useValue: {
            isNarrow: isNarrowSignal,
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(SettingsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component on narrow screens', () => {
    expect(component).toBeTruthy();
  });

  it('computes permission signals accurately for standard user', () => {
    expect(component['canManageInvites']()).toBe(false);
    expect(component['canManageUsers']()).toBe(false);
    expect(component['canManageRoles']()).toBe(false);
    expect(component['canManageSettings']()).toBe(false);
    expect(component['entries']().map((entry) => entry.link)).toEqual([
      '/settings/profile',
      '/settings/security',
      '/settings/devices',
      '/settings/notifications',
    ]);
  });

  it('computes permission signals accurately for privileged user', () => {
    store.overrideSelector(selectCurrentUser, {
      ...me,
      permissions: [
        EPermission.MANAGE_INVITES,
        EPermission.MANAGE_USERS,
        EPermission.MANAGE_ROLES,
        EPermission.MANAGE_SETTINGS,
      ],
    });
    store.refreshState();
    fixture.detectChanges();

    expect(component['canManageInvites']()).toBe(true);
    expect(component['canManageUsers']()).toBe(true);
    expect(component['canManageRoles']()).toBe(true);
    expect(component['canManageSettings']()).toBe(true);
    expect(component['entries']().map((entry) => entry.link)).toEqual([
      '/settings/profile',
      '/settings/security',
      '/settings/devices',
      '/settings/notifications',
      '/settings/invites',
      '/settings/users',
      '/settings/roles',
      '/settings/admin',
    ]);
  });

  it('redirects to /settings/profile when not narrow (desktop)', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    isNarrowSignal.set(false);
    TestBed.flushEffects();

    expect(navigateSpy).toHaveBeenCalledWith(['/settings/profile'], {
      replaceUrl: true,
    });
  });
});
