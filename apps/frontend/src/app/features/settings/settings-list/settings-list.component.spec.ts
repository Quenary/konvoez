import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideMockStore } from '@ngrx/store/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { IUserFull } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { LayoutService } from '@core/services/layout.service';
import { SettingsListComponent } from './settings-list.component';

describe('SettingsListComponent', () => {
  let fixture: ComponentFixture<SettingsListComponent>;
  let component: SettingsListComponent;
  let router: Router;
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
    fixture = TestBed.createComponent(SettingsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component on narrow screens', () => {
    expect(component).toBeTruthy();
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
