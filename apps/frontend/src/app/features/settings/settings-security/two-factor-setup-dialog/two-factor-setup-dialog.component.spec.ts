import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { TwoFactorApiService } from '@core/api/two-factor-api.service';
import { TwoFactorSetupDialogComponent } from './two-factor-setup-dialog.component';

describe('TwoFactorSetupDialogComponent', () => {
  let fixture: ComponentFixture<TwoFactorSetupDialogComponent>;
  let component: TwoFactorSetupDialogComponent;

  const mockContext = {
    completeWith: vi.fn(),
  };

  const mockTwoFactorApiService = {
    setup: vi.fn(),
    enable: vi.fn(),
  };

  const setup = async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [TwoFactorSetupDialogComponent],
      providers: [
        provideTranslateService(),
        { provide: POLYMORPHEUS_CONTEXT, useValue: mockContext },
        { provide: TwoFactorApiService, useValue: mockTwoFactorApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TwoFactorSetupDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('validates password and advances to step 2 on setup success', async () => {
    await setup();
    mockTwoFactorApiService.setup.mockReturnValue(
      of({
        secret: 'TESTSECRET123',
        otpauthUri: 'otpauth://totp/Konvoez:alice?secret=TESTSECRET123',
      }),
    );

    component['passwordForm'].controls.password.setValue('');
    component['onPasswordSubmit']();
    expect(mockTwoFactorApiService.setup).not.toHaveBeenCalled();

    component['passwordForm'].controls.password.setValue('MyPassword123');
    component['onPasswordSubmit']();

    expect(mockTwoFactorApiService.setup).toHaveBeenCalledWith({
      password: 'MyPassword123',
    });
    expect(component['step']()).toBe(2);
    expect(component['secret']()).toBe('TESTSECRET123');
  });

  it('validates 6-digit code and completes setup with recovery codes', async () => {
    await setup();
    component['step'].set(2);
    fixture.detectChanges();

    mockTwoFactorApiService.enable.mockReturnValue(
      of({
        recoveryCodes: ['CODE1', 'CODE2'],
      }),
    );

    component['codeForm'].controls.code.setValue('123'); // invalid length
    component['onCodeSubmit']();
    expect(mockTwoFactorApiService.enable).not.toHaveBeenCalled();

    component['codeForm'].controls.code.setValue('123456');
    component['onCodeSubmit']();

    expect(mockTwoFactorApiService.enable).toHaveBeenCalledWith({
      code: '123456',
    });
    expect(mockContext.completeWith).toHaveBeenCalledWith(['CODE1', 'CODE2']);
  });
});
