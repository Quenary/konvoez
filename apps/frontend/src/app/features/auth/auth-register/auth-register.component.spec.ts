import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthRegisterComponent } from './auth-register.component';
import { PublicStore } from '@core/stores/public.store';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ActivatedRoute } from '@angular/router';
import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthActions } from '@core/auth/auth.actions';
import { selectAuthLoading } from '@core/auth/auth.selectors';
import { provideTranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { IPublicSettings } from '@konvoez/shared';

describe('AuthRegisterComponent', () => {
  let component: AuthRegisterComponent;
  let fixture: ComponentFixture<AuthRegisterComponent>;
  let store: MockStore;

  const setupTestBed = async (
    isOwnerSetupRequired: boolean,
    inviteOnlySignUp = false,
    queryParams: Record<string, string> = {},
    isLoading = false,
  ) => {
    const settingsSignal = signal<IPublicSettings>({
      isOwnerSetupRequired,
      inviteOnlySignUp,
      smtpConfigured: false,
      appUrlConfigured: false,
    });

    await TestBed.configureTestingModule({
      imports: [AuthRegisterComponent],
      providers: [
        provideTranslateService(),
        {
          provide: PublicStore,
          useValue: {
            publicSettings: {
              value: settingsSignal.asReadonly(),
              isLoading: signal(isLoading).asReadonly(),
              reload: vi.fn(),
            },
            isOwnerSetupRequired: signal(isOwnerSetupRequired).asReadonly(),
            inviteOnlySignUp: signal(inviteOnlySignUp).asReadonly(),
            isSmtpConfigured: signal(false).asReadonly(),
            settings: settingsSignal.asReadonly(),
            reload: vi.fn(),
          },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams } } },
        provideMockStore({
          selectors: [{ selector: selectAuthLoading, value: false }],
        }),
      ],
    }).compileComponents();

    store = TestBed.inject(MockStore);
    vi.spyOn(store, 'dispatch');

    fixture = TestBed.createComponent(AuthRegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  };

  afterEach(() => {
    store.resetSelectors();
  });

  describe('when owner setup is required', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      await setupTestBed(true);
    });

    it('should identify that owner setup is required', () => {
      expect(component['isOwnerSetupRequired']()).toBe(true);
    });

    it('should be invalid when setupToken is empty', () => {
      component['form'].patchValue({
        username: 'newowner',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        fullname: 'New Owner',
        email: 'owner@example.com',
        setupToken: '',
      });

      expect(component['form'].invalid).toBe(true);
    });

    it('should be valid and dispatch register with setupToken when valid', () => {
      component['form'].patchValue({
        username: 'newowner',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        fullname: 'New Owner',
        email: 'owner@example.com',
        setupToken: 'valid-setup-token',
      });

      expect(component['form'].valid).toBe(true);

      component.onSubmit();

      expect(store.dispatch).toHaveBeenCalledWith(
        AuthActions.requestRegister({
          body: {
            username: 'newowner',
            password: 'Password123!',
            fullname: 'New Owner',
            email: 'owner@example.com',
            setupToken: 'valid-setup-token',
          },
        }),
      );
    });
  });

  describe('when owner setup is not required', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      await setupTestBed(false);
    });

    it('should identify that owner setup is not required', () => {
      expect(component['isOwnerSetupRequired']()).toBe(false);
    });

    it('should be valid without setupToken', () => {
      component['form'].patchValue({
        username: 'regularmember',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        fullname: 'Regular Member',
        email: 'member@example.com',
        setupToken: '',
      });

      expect(component['form'].valid).toBe(true);

      component.onSubmit();

      expect(store.dispatch).toHaveBeenCalledWith(
        AuthActions.requestRegister({
          body: {
            username: 'regularmember',
            password: 'Password123!',
            fullname: 'Regular Member',
            email: 'member@example.com',
          },
        }),
      );
    });
  });

  describe('when invite-only mode is enabled', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      await setupTestBed(false, true);
    });

    it('should be invalid when inviteCode is missing', () => {
      component['form'].patchValue({
        username: 'regularmember',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        fullname: 'Regular Member',
        email: 'member@example.com',
        inviteCode: '',
      });

      expect(component['form'].invalid).toBe(true);
    });

    it('should be valid and send inviteCode when provided', () => {
      component['form'].patchValue({
        username: 'regularmember',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        fullname: 'Regular Member',
        email: 'member@example.com',
        inviteCode: 'valid-invite-code',
      });

      expect(component['form'].valid).toBe(true);

      component.onSubmit();

      expect(store.dispatch).toHaveBeenCalledWith(
        AuthActions.requestRegister({
          body: {
            username: 'regularmember',
            password: 'Password123!',
            fullname: 'Regular Member',
            email: 'member@example.com',
            inviteCode: 'valid-invite-code',
          },
        }),
      );
    });
  });

  describe('query params and loading state', () => {
    it('should prefill inviteCode and email from query params', async () => {
      await setupTestBed(false, false, {
        code: 'param-invite-code',
        email: 'prefill@example.com',
      });

      expect(component['form'].controls.inviteCode.value).toBe(
        'param-invite-code',
      );
      expect(component['form'].controls.email.value).toBe(
        'prefill@example.com',
      );
    });

    it('should not dispatch register when settings are loading', async () => {
      await setupTestBed(false, false, {}, true);

      component['form'].patchValue({
        username: 'regularmember',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        fullname: 'Regular Member',
        email: 'member@example.com',
      });

      component.onSubmit();

      expect(store.dispatch).not.toHaveBeenCalled();
    });
  });
});
