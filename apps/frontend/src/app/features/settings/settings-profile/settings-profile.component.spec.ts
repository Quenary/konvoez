import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideStore, Store } from '@ngrx/store';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { TUI_OPTIONS, TuiNotificationService } from '@taiga-ui/core';
import { AuthActions } from '@core/auth/auth.actions';
import { authReducer } from '@core/auth/auth.reducer';
import { ProfileApiService } from '@core/api/profile-api.service';
import { PublicStore } from '@core/stores/public.store';
import { IUserFull } from '@konvoez/shared';
import { SettingsProfileComponent } from './settings-profile.component';

describe('SettingsProfileComponent', () => {
  let fixture: ComponentFixture<SettingsProfileComponent>;
  let component: SettingsProfileComponent;

  const mockProfileApi = {
    avatarUpload: vi.fn(),
    requestEmailVerification: vi.fn(),
    confirmEmailVerification: vi.fn(),
    confirmEmailChange: vi.fn(),
    resendEmailChange: vi.fn(),
    cancelEmailChange: vi.fn(),
  };

  const mockDialogService = {
    open: vi.fn(),
  };

  const mockNotificationService = {
    open: vi.fn().mockReturnValue(of(null)),
  };

  const createDummyUser = (overrides: Partial<IUserFull> = {}): IUserFull => ({
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
    twoFactorEnabled: false,
    emailVerified: false,
    pendingEmail: null,
    ...overrides,
  });

  const setupTestBed = async (
    user: IUserFull,
    publicSettings = {
      isOwnerSetupRequired: false,
      inviteOnlySignUp: false,
      smtpConfigured: true,
    },
  ) => {
    const publicSettingsSignal = signal(publicSettings);
    mockProfileApi.requestEmailVerification.mockReturnValue(of({ ok: true }));
    mockProfileApi.confirmEmailVerification.mockReturnValue(
      of({ ...user, emailVerified: true }),
    );

    await TestBed.configureTestingModule({
      imports: [SettingsProfileComponent],
      providers: [
        {
          provide: TUI_OPTIONS,
          useValue: {
            apis: 'stable',
            fontScaling: false,
            scrollbars: 'native',
          },
        },
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        { provide: ProfileApiService, useValue: mockProfileApi },
        {
          provide: PublicStore,
          useValue: {
            publicSettings: {
              value: publicSettingsSignal,
            },
            isSmtpConfigured: computed(() =>
              Boolean(publicSettingsSignal().smtpConfigured),
            ),
          },
        },
        { provide: TuiNotificationService, useValue: mockNotificationService },
        { provide: TuiResponsiveDialogService, useValue: mockDialogService },
      ],
    }).compileComponents();

    TestBed.inject(Store).dispatch(AuthActions.requestLoginSuccess({ user }));

    fixture = TestBed.createComponent(SettingsProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('renders verified badge when email is verified', async () => {
    await setupTestBed(createDummyUser({ emailVerified: true }));
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain(
      'SETTINGS.PROFILE.EMAIL_VERIFICATION.VERIFIED',
    );
  });

  it('renders unverified badge and verify button when email is not verified and SMTP enabled', async () => {
    await setupTestBed(createDummyUser({ emailVerified: false }));
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain(
      'SETTINGS.PROFILE.EMAIL_VERIFICATION.UNVERIFIED',
    );
    expect(compiled.textContent).toContain(
      'SETTINGS.PROFILE.EMAIL_VERIFICATION.VERIFY_BTN',
    );
  });

  it('requests verification code when verify button is clicked and shows code input', async () => {
    await setupTestBed(createDummyUser({ emailVerified: false }));
    component['requestEmailVerification']();
    fixture.detectChanges();

    expect(mockProfileApi.requestEmailVerification).toHaveBeenCalled();
    expect(component['isVerificationCardOpen']()).toBe(true);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain(
      'SETTINGS.PROFILE.EMAIL_VERIFICATION.CODE_ENTER_HINT',
    );
  });

  it('computes isCodeValid based on trimmed code length of 6', async () => {
    await setupTestBed(createDummyUser({ emailVerified: false }));
    component['verificationCode'].set('123');
    expect(component['isCodeValid']()).toBe(false);

    component['verificationCode'].set(' 123456 ');
    expect(component['isCodeValid']()).toBe(true);
  });

  it('confirms email verification code and updates store', async () => {
    const user = createDummyUser({ emailVerified: false });
    await setupTestBed(user);

    component['verificationCode'].set('123456');
    component['confirmEmailVerification']();

    expect(mockProfileApi.confirmEmailVerification).toHaveBeenCalledWith({
      code: '123456',
    });
  });

  it('renders pending email notice and allows confirming or cancelling change', async () => {
    const user = createDummyUser({
      emailVerified: true,
      pendingEmail: 'new@example.com',
    });
    mockProfileApi.confirmEmailChange.mockReturnValue(
      of({ ...user, email: 'new@example.com', pendingEmail: null }),
    );
    mockProfileApi.cancelEmailChange.mockReturnValue(
      of({ ...user, pendingEmail: null }),
    );

    await setupTestBed(user);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain(
      'SETTINGS.PROFILE.EMAIL_CHANGE.PENDING_NOTICE',
    );

    component['verificationCode'].set('654321');
    component['confirmEmailChange']();
    expect(mockProfileApi.confirmEmailChange).toHaveBeenCalledWith({
      code: '654321',
    });

    component['cancelEmailChange']();
    expect(mockProfileApi.cancelEmailChange).toHaveBeenCalled();
  });
});
