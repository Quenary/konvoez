import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { provideStore, Store } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import type { IUserFull } from '@konvoez/shared';
import { AuthActions } from '@core/auth/auth.actions';
import { authReducer } from '@core/auth/auth.reducer';
import { SettingsSecurityComponent } from './settings-security.component';

describe('SettingsSecurityComponent', () => {
  let fixture: ComponentFixture<SettingsSecurityComponent>;
  let store: Store;
  const mockDialogService = {
    open: vi.fn(),
  };

  const createDummyUser = (twoFactorEnabled: boolean): IUserFull => ({
    id: 1,
    username: 'alice',
    fullname: 'Alice Smith',
    email: 'alice@example.com',
    avatar: null,
    avatarUrl: null,
    isOwner: false,
    roles: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
    twoFactorEnabled,
  });

  const setupTestBed = async (twoFactorEnabled: boolean) => {
    mockDialogService.open.mockReset();

    await TestBed.configureTestingModule({
      imports: [SettingsSecurityComponent],
      providers: [
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        {
          provide: TuiResponsiveDialogService,
          useValue: mockDialogService,
        },
      ],
    }).compileComponents();

    store = TestBed.inject(Store);
    store.dispatch(
      AuthActions.requestLoginSuccess({
        user: createDummyUser(twoFactorEnabled),
      }),
    );

    fixture = TestBed.createComponent(SettingsSecurityComponent);
    fixture.detectChanges();
  };

  it('renders disabled status and enable button when 2FA is off', async () => {
    await setupTestBed(false);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('GENERAL.DISABLED');
    expect(compiled.textContent).toContain(
      'SETTINGS.SECURITY.TWO_FACTOR.ENABLE',
    );
  });

  it('opens setup dialog and enables 2FA on completion', async () => {
    await setupTestBed(false);
    const recoveryCodes = ['ABCD1234EF', 'GHJK5678MN'];

    mockDialogService.open
      .mockReturnValueOnce(of(recoveryCodes))
      .mockReturnValueOnce(of(undefined));

    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button',
    );
    button?.click();

    expect(mockDialogService.open).toHaveBeenCalledTimes(2);
    expect(dispatchSpy).toHaveBeenCalledWith(
      AuthActions.setTwoFactorEnabled({ enabled: true }),
    );
  });

  it('renders enabled status and action buttons when 2FA is on', async () => {
    await setupTestBed(true);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('GENERAL.ENABLED');
    expect(compiled.textContent).toContain(
      'SETTINGS.SECURITY.TWO_FACTOR.DISABLE',
    );
    expect(compiled.textContent).toContain(
      'SETTINGS.SECURITY.TWO_FACTOR.REGENERATE',
    );
  });

  it('opens disable dialog and updates store on confirmation', async () => {
    await setupTestBed(true);
    mockDialogService.open.mockReturnValueOnce(of(true));

    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const disableButton = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) =>
      b.textContent?.includes('SETTINGS.SECURITY.TWO_FACTOR.DISABLE'),
    );
    disableButton?.click();

    expect(mockDialogService.open).toHaveBeenCalledOnce();
    expect(dispatchSpy).toHaveBeenCalledWith(
      AuthActions.setTwoFactorEnabled({ enabled: false }),
    );
  });
});
