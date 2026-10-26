import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { TwoFactorApiService } from '@core/api/two-factor-api.service';
import {
  ITwoFactorConfirmDialogData,
  TwoFactorConfirmDialogComponent,
} from './two-factor-confirm-dialog.component';

describe('TwoFactorConfirmDialogComponent', () => {
  let fixture: ComponentFixture<TwoFactorConfirmDialogComponent>;
  let component: TwoFactorConfirmDialogComponent;

  const mockContext = {
    data: { action: 'disable' } as ITwoFactorConfirmDialogData,
    completeWith: vi.fn(),
  };

  const mockTwoFactorApiService = {
    disable: vi.fn(),
    regenerateRecoveryCodes: vi.fn(),
  };

  const setup = async (action: 'disable' | 'regenerate' = 'disable') => {
    vi.clearAllMocks();
    mockContext.data = { action };

    await TestBed.configureTestingModule({
      imports: [TwoFactorConfirmDialogComponent],
      providers: [
        provideTranslateService(),
        { provide: POLYMORPHEUS_CONTEXT, useValue: mockContext },
        { provide: TwoFactorApiService, useValue: mockTwoFactorApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TwoFactorConfirmDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('rejects invalid inputs on submit', async () => {
    await setup('disable');

    component['form'].controls.password.setValue('');
    component['form'].controls.code.setValue('');
    component['onSubmit']();

    expect(mockTwoFactorApiService.disable).not.toHaveBeenCalled();
    expect(mockContext.completeWith).not.toHaveBeenCalled();
  });

  it('submits disable action and completes with true on success', async () => {
    await setup('disable');
    mockTwoFactorApiService.disable.mockReturnValue(of(undefined));

    component['form'].controls.password.setValue('MyPassword123');
    component['form'].controls.code.setValue('123456');
    component['onSubmit']();

    expect(mockTwoFactorApiService.disable).toHaveBeenCalledWith({
      password: 'MyPassword123',
      code: '123456',
    });
    expect(mockContext.completeWith).toHaveBeenCalledWith(true);
  });

  it('submits regenerate action and completes with new recovery codes', async () => {
    await setup('regenerate');
    mockTwoFactorApiService.regenerateRecoveryCodes.mockReturnValue(
      of({ recoveryCodes: ['NEW1', 'NEW2'] }),
    );

    component['form'].controls.password.setValue('MyPassword123');
    component['form'].controls.code.setValue('123456');
    component['onSubmit']();

    expect(
      mockTwoFactorApiService.regenerateRecoveryCodes,
    ).toHaveBeenCalledWith({
      password: 'MyPassword123',
      code: '123456',
    });
    expect(mockContext.completeWith).toHaveBeenCalledWith(['NEW1', 'NEW2']);
  });
});
