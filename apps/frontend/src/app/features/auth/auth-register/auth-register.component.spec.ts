import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthRegisterComponent } from './auth-register.component';
import { PublicApiService } from '@core/services/public-api.service';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthActions } from '../auth.actions';
import { selectAuthLoading } from '../auth.selectors';
import { provideTranslateService } from '@ngx-translate/core';

describe('AuthRegisterComponent', () => {
  let component: AuthRegisterComponent;
  let fixture: ComponentFixture<AuthRegisterComponent>;
  let store: MockStore;
  const mockPublicApiService = {
    getSettings: vi.fn(),
  };

  const setupTestBed = async (
    isOwnerSetupRequired: boolean,
    inviteOnlySignUp = false,
    queryParams: Record<string, string> = {},
  ) => {
    mockPublicApiService.getSettings.mockReturnValue(
      of({ isOwnerSetupRequired, inviteOnlySignUp }),
    );

    await TestBed.configureTestingModule({
      imports: [AuthRegisterComponent],
      providers: [
        provideTranslateService(),
        { provide: PublicApiService, useValue: mockPublicApiService },
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
});
